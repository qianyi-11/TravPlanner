import { initializeApp, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { candidateIdFromPlaceId } from "../../functions/src/candidates/candidateIdentity";
import { removeSubmissionHandler } from "../../functions/src/candidates/removeSubmission";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { updateSubmissionHandler } from "../../functions/src/candidates/updateSubmission";
import { PlaceResolutionError, type NormalizedPlace, type PlaceResolver } from "../../functions/src/integrations/google/places";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const placeResolver: PlaceResolver = async placeId => ({
  placeId,
  name: `Provider ${placeId}`,
  formattedAddress: `${placeId} address`,
  lat: 3.139,
  lng: 101.6869,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: ["tourist_attraction"],
});

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return {
    data,
    auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } },
  } as CallableRequest<unknown>;
}

async function createTrip() {
  return createTripHandlerWithResolver(request("owner", {
    name: "Candidate trip",
    destinationPlaceId: "destination",
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "client hint", lat: 0, lng: 0 },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
    primaryTransport: "WALKING",
    activityBudgetCurrency: "MYR",
  }), placeResolver);
}

async function joinMember(tripId: string, inviteToken: string, uid = "member") {
  return joinTripHandler(request(uid, { tripId, inviteToken }));
}

function submissionData(tripId: string, placeId: string, overrides: Record<string, unknown> = {}) {
  return {
    tripId,
    expectedPlanningCycle: 1,
    placeId,
    preference: "INTERESTED",
    preferredPeriod: "ANYTIME",
    estimatedDurationMinutes: 60,
    durationSource: "USER_OVERRIDE",
    ...overrides,
  };
}

async function submit(uid: string, tripId: string, placeId: string, overrides: Record<string, unknown> = {}, resolver = placeResolver) {
  return submitCandidateHandlerWithResolver(request(uid, submissionData(tripId, placeId, overrides)), resolver);
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

function candidateRef(tripId: string, placeId: string) {
  return getFirestore().doc(`trips/${tripId}/candidates/${candidateIdFromPlaceId(placeId)}`);
}

function submissionRef(tripId: string, uid: string, placeId: string) {
  return getFirestore().doc(`trips/${tripId}/submissions/${uid}_${candidateIdFromPlaceId(placeId)}`);
}

describeEmulator("Candidates + Preferences", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-candidates-test" });
  });

  it("creates canonical candidate facts, one submission, and no candidate snapshot", async () => {
    const trip = await createTrip();
    const tripBefore = await getFirestore().doc(`trips/${trip.tripId}`).get();
    const result = await submit("owner", trip.tripId, "ChIJ-first");
    const tripAfter = await getFirestore().doc(`trips/${trip.tripId}`).get();
    const candidate = await candidateRef(trip.tripId, "ChIJ-first").get();
    const snapshot = await getFirestore().doc(`trips/${trip.tripId}/externalSnapshots/candidate-${result.candidateId}`).get();

    expect(result).toMatchObject({ candidateId: candidateIdFromPlaceId("ChIJ-first"), deduplicated: false, warningCodes: [] });
    expect(candidate.data()).toMatchObject({
      placeId: "ChIJ-first",
      name: "Provider ChIJ-first",
      formattedAddress: "ChIJ-first address",
      location: { lat: 3.139, lng: 101.6869 },
      placeTypes: ["tourist_attraction"],
      environment: "UNKNOWN",
      active: true,
      shortlistStatus: "PENDING",
      firstSubmittedBy: "owner",
      activationVersion: 1,
    });
    expect(candidate.data()).not.toHaveProperty("environmentSource");
    expect(candidate.data()).not.toHaveProperty("candidateId");
    expect(snapshot.exists).toBe(false);
    expect((await submissionRef(trip.tripId, "owner", "ChIJ-first").get()).exists).toBe(true);
    expect(tripAfter.data()?.updatedAt).toEqual(tripBefore.data()?.updatedAt);
  });

  it("reuses provider facts and creates separate deterministic submissions", async () => {
    const trip = await createTrip();
    await joinMember(trip.tripId, trip.inviteToken);
    const results = await Promise.all([
      submit("owner", trip.tripId, "ChIJ-shared"),
      submit("member", trip.tripId, "ChIJ-shared"),
    ]);
    const candidate = await candidateRef(trip.tripId, "ChIJ-shared").get();
    const submissions = await getFirestore().collection(`trips/${trip.tripId}/submissions`).get();

    expect(results.map(result => result.deduplicated).sort()).toEqual([false, true]);
    expect(candidate.exists).toBe(true);
    expect(submissions.size).toBe(2);
    expect(candidate.data()?.name).toBe("Provider ChIJ-shared");
  }, 30_000);

  it("makes exact replay idempotent and rejects changed replay", async () => {
    const trip = await createTrip();
    const first = await submit("owner", trip.tripId, "ChIJ-replay", { notes: "first" });
    const before = await submissionRef(trip.tripId, "owner", "ChIJ-replay").get();
    const replay = await submit("owner", trip.tripId, "ChIJ-replay", { notes: "first" });
    const changedReason = await reasonOf(() => submit("owner", trip.tripId, "ChIJ-replay", { notes: "changed" }));
    const after = await submissionRef(trip.tripId, "owner", "ChIJ-replay").get();

    expect(first.deduplicated).toBe(false);
    expect(replay).toMatchObject({ candidateId: first.candidateId, submissionId: first.submissionId, deduplicated: true, warningCodes: [] });
    expect(changedReason).toBe("CONFLICT");
    expect(after.data()).toEqual(before.data());
  });

  it("does not refresh existing provider facts", async () => {
    const trip = await createTrip();
    await submit("owner", trip.tripId, "ChIJ-stable");
    await joinMember(trip.tripId, trip.inviteToken);
    const changedResolver: PlaceResolver = async placeId => ({
      placeId,
      name: "Changed provider name",
      formattedAddress: "Changed address",
      lat: 4,
      lng: 5,
      timezone: "Asia/Kuala_Lumpur",
      placeTypes: ["changed_type"],
    });
    await submit("member", trip.tripId, "ChIJ-stable", {}, changedResolver);

    expect((await candidateRef(trip.tripId, "ChIJ-stable").get()).data()).toMatchObject({
      name: "Provider ChIJ-stable",
      formattedAddress: "ChIJ-stable address",
      location: { lat: 3.139, lng: 101.6869 },
      placeTypes: ["tourist_attraction"],
    });
  });

  it("enforces active membership, COLLECTING, cycle, and SYSTEM duration guards", async () => {
    const trip = await createTrip();
    expect(await reasonOf(() => submit("missing", trip.tripId, "ChIJ-guard"))).toBe("NOT_MEMBER");
    await joinMember(trip.tripId, trip.inviteToken);
    await getFirestore().doc(`trips/${trip.tripId}/members/member`).update({ status: "REMOVED" });
    expect(await reasonOf(() => submit("member", trip.tripId, "ChIJ-removed"))).toBe("MEMBER_INACTIVE");
    const systemResolver: PlaceResolver = async () => {
      throw new Error("resolver should not run");
    };
    expect(await reasonOf(() => submit("owner", trip.tripId, "ChIJ-system", { durationSource: "SYSTEM" }, systemResolver))).toBe("INVALID_INPUT");

    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "VOTING" });
    expect(await reasonOf(() => submit("owner", trip.tripId, "ChIJ-phase"))).toBe("INVALID_PHASE");
    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "COLLECTING", planningCycle: 2 });
    expect(await reasonOf(() => submit("owner", trip.tripId, "ChIJ-cycle"))).toBe("STALE_PLANNING_CYCLE");
    expect((await getFirestore().collection(`trips/${trip.tripId}/candidates`).get()).empty).toBe(true);
  });

  it("maps provider failures and leaves no partial state", async () => {
    const cases: Array<[string, PlaceResolver, string]> = [
      ["ChIJ-not-found", async () => { throw new PlaceResolutionError("NOT_FOUND"); }, "NOT_FOUND"],
      ["ChIJ-timeout", async () => { throw new Error("timeout"); }, "EXTERNAL_DATA_UNAVAILABLE"],
      ["ChIJ-malformed", async () => ({}) as NormalizedPlace, "EXTERNAL_DATA_UNAVAILABLE"],
      ["ChIJ-null", async () => null as unknown as NormalizedPlace, "EXTERNAL_DATA_UNAVAILABLE"],
    ];

    for (const [placeId, resolver, reason] of cases) {
      const trip = await createTrip();
      expect(await reasonOf(() => submit("owner", trip.tripId, placeId, {}, resolver))).toBe(reason);
      expect((await getFirestore().collection(`trips/${trip.tripId}/candidates`).get()).empty).toBe(true);
      expect((await getFirestore().collection(`trips/${trip.tripId}/submissions`).get()).empty).toBe(true);
    }
  });

  it("enforces max five submissions and max two MUST_DO submissions under overlap", async () => {
    const trip = await createTrip();
    for (let i = 0; i < 4; i += 1) await submit("owner", trip.tripId, `ChIJ-five-${i}`);
    const boundary = await Promise.allSettled([
      submit("owner", trip.tripId, "ChIJ-five-4"),
      submit("owner", trip.tripId, "ChIJ-five-5"),
    ]);
    const submissions = await getFirestore().collection(`trips/${trip.tripId}/submissions`).where("memberId", "==", "owner").get();
    expect(boundary.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(submissions.size).toBe(5);

    const mustTrip = await createTrip();
    await submit("owner", mustTrip.tripId, "ChIJ-must-0", { preference: "MUST_DO" });
    const mustBoundary = await Promise.allSettled([
      submit("owner", mustTrip.tripId, "ChIJ-must-1", { preference: "MUST_DO" }),
      submit("owner", mustTrip.tripId, "ChIJ-must-2", { preference: "MUST_DO" }),
    ]);
    const mustSubmissions = await getFirestore().collection(`trips/${mustTrip.tripId}/submissions`).where("memberId", "==", "owner").get();
    expect(mustBoundary.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(mustSubmissions.docs.filter(doc => doc.data().preference === "MUST_DO")).toHaveLength(2);
  }, 30_000);

  it("updates only the owner submission and preserves the concurrent MUST_DO limit", async () => {
    const trip = await createTrip();
    const first = await submit("owner", trip.tripId, "ChIJ-promote-0", { preference: "MUST_DO", notes: "keep" });
    const second = await submit("owner", trip.tripId, "ChIJ-promote-1");
    const third = await submit("owner", trip.tripId, "ChIJ-promote-2");
    const promotions = await Promise.allSettled([
      updateSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: second.candidateId, patch: { preference: "MUST_DO" } })),
      updateSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: third.candidateId, patch: { preference: "MUST_DO" } })),
    ]);
    const all = await getFirestore().collection(`trips/${trip.tripId}/submissions`).where("memberId", "==", "owner").get();

    expect(promotions.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(all.docs.filter(doc => doc.data().preference === "MUST_DO")).toHaveLength(2);
    expect(await reasonOf(() => updateSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: first.candidateId, patch: { durationSource: "SYSTEM" } })))).toBe("INVALID_INPUT");
    await updateSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: first.candidateId, patch: { preferredPeriod: "EVENING" } }));
    expect((await submissionRef(trip.tripId, "owner", "ChIJ-promote-0").get()).data()).toMatchObject({ notes: "keep", preferredPeriod: "EVENING" });
    await updateSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: first.candidateId, patch: { notes: "" } }));
    expect((await submissionRef(trip.tripId, "owner", "ChIJ-promote-0").get()).data()).not.toHaveProperty("notes");
  }, 30_000);

  it("allows updates for inactive candidates without changing candidate lifecycle", async () => {
    const trip = await createTrip();
    const result = await submit("owner", trip.tripId, "ChIJ-inactive");
    await candidateRef(trip.tripId, "ChIJ-inactive").update({ active: false });
    await updateSubmissionHandler(request("owner", {
      tripId: trip.tripId,
      expectedPlanningCycle: 1,
      candidateId: result.candidateId,
      patch: { notes: "still editable" },
    }));

    expect((await candidateRef(trip.tripId, "ChIJ-inactive").get()).data()).toMatchObject({ active: false });
    expect((await submissionRef(trip.tripId, "owner", "ChIJ-inactive").get()).data()).toMatchObject({ notes: "still editable" });
  });

  it("deletes submissions and derives lifecycle only from remaining ACTIVE support", async () => {
    const trip = await createTrip();
    await joinMember(trip.tripId, trip.inviteToken);
    await submit("owner", trip.tripId, "ChIJ-remove");
    await submit("member", trip.tripId, "ChIJ-remove");
    const ownerRemoval = await removeSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("ChIJ-remove") }));
    expect(ownerRemoval).toEqual({ removed: true, candidateDeactivated: false });
    expect((await candidateRef(trip.tripId, "ChIJ-remove").get()).data()).toMatchObject({ active: true });

    const finalRemoval = await removeSubmissionHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("ChIJ-remove") }));
    expect(finalRemoval).toEqual({ removed: true, candidateDeactivated: true });
    expect((await candidateRef(trip.tripId, "ChIJ-remove").get()).data()).toMatchObject({ active: false });
  });

  it("reactivates an inactive candidate and preserves first-submitter history", async () => {
    const trip = await createTrip();
    const first = await submit("owner", trip.tripId, "ChIJ-reactivate");
    const before = (await candidateRef(trip.tripId, "ChIJ-reactivate").get()).data();
    await removeSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: first.candidateId }));
    const reactivated = await submit("owner", trip.tripId, "ChIJ-reactivate");
    const after = (await candidateRef(trip.tripId, "ChIJ-reactivate").get()).data();

    expect(reactivated.deduplicated).toBe(true);
    expect(after).toMatchObject({ active: true, activationVersion: 2, shortlistStatus: "PENDING", firstSubmittedBy: before?.firstSubmittedBy, firstSubmittedAt: before?.firstSubmittedAt, createdAt: before?.createdAt });
  });

  it("increments activationVersion once when concurrent submissions reactivate a candidate", async () => {
    const trip = await createTrip();
    await joinMember(trip.tripId, trip.inviteToken);
    const first = await submit("owner", trip.tripId, "ChIJ-reactivate-race");
    const before = (await candidateRef(trip.tripId, "ChIJ-reactivate-race").get()).data();
    await removeSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: first.candidateId }));
    await candidateRef(trip.tripId, "ChIJ-reactivate-race").update({ activationVersion: FieldValue.delete() });
    const results = await Promise.allSettled([
      submit("owner", trip.tripId, "ChIJ-reactivate-race"),
      submit("member", trip.tripId, "ChIJ-reactivate-race"),
    ]);
    const candidate = await candidateRef(trip.tripId, "ChIJ-reactivate-race").get();
    const submissions = await getFirestore().collection(`trips/${trip.tripId}/submissions`).where("candidateId", "==", first.candidateId).get();

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2);
    expect(submissions.size).toBe(2);
    expect(candidate.data()).toMatchObject({
      active: true,
      activationVersion: 2,
      firstSubmittedBy: before?.firstSubmittedBy,
      firstSubmittedAt: before?.firstSubmittedAt,
      createdAt: before?.createdAt,
    });
  }, 30_000);

  it("does not use candidate votes for explicit removal and ignores removed-member history", async () => {
    const trip = await createTrip();
    await joinMember(trip.tripId, trip.inviteToken);
    const owner = await submit("owner", trip.tripId, "ChIJ-no-vote-read");
    await submit("member", trip.tripId, "ChIJ-no-vote-read");
    await getFirestore().doc(`trips/${trip.tripId}/candidateVotes/irrelevant`).set({ malformed: true });
    await getFirestore().doc(`trips/${trip.tripId}/members/member`).update({ status: "REMOVED" });
    const result = await removeSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: owner.candidateId }));

    expect(result).toEqual({ removed: true, candidateDeactivated: true });
    expect((await getFirestore().doc(`trips/${trip.tripId}/submissions/member_${owner.candidateId}`).get()).exists).toBe(true);
  });

  it("rejects non-owners and missing candidate submissions", async () => {
    const trip = await createTrip();
    await joinMember(trip.tripId, trip.inviteToken);
    const member = await submit("member", trip.tripId, "ChIJ-owner-only");
    expect(await reasonOf(() => updateSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: member.candidateId, patch: { notes: "no" } })))).toBe("NOT_FOUND");
    expect(await reasonOf(() => removeSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: member.candidateId })))).toBe("NOT_FOUND");
    expect(await reasonOf(() => updateSubmissionHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: "missing", patch: { notes: "no" } })))).toBe("NOT_FOUND");
  });
});
