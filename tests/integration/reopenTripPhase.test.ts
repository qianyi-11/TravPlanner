import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { reopenTripPhaseHandler } from "../../functions/src/trips/reopenTripPhase";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { removeSubmissionHandler } from "../../functions/src/candidates/removeSubmission";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { candidateIdFromPlaceId } from "../../functions/src/candidates/candidateIdentity";
import { candidateVoteId } from "../../functions/src/voting/candidateVoteIdentity";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const resolver: PlaceResolver = async placeId => ({ placeId, name: placeId, lat: 3, lng: 101, timezone: "Asia/Kuala_Lumpur", placeTypes: [] });
function request(uid: string, data: unknown): CallableRequest<unknown> { return { data, auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } } } as CallableRequest<unknown>; }

function barrier() {
  let release!: () => void;
  let resolveEntered!: () => void;
  const entered = new Promise<void>(resolve => { resolveEntered = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  return {
    entered,
    release,
    hook: async () => {
      resolveEntered();
      await released;
    },
  };
}

async function setupReactivationRace(placeId: string) {
  const trip = await createTripHandlerWithResolver(request("owner", {
    name: "Candidate reopen race", destinationPlaceId: "destination", startDate: "2026-09-01", endDate: "2026-09-03",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 }, defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, primaryTransport: "WALKING", activityBudgetCurrency: "MYR",
  }), resolver);
  await joinTripHandler(request("member", { tripId: trip.tripId, inviteToken: trip.inviteToken }));
  const first = await submitCandidateHandlerWithResolver(request("owner", {
    tripId: trip.tripId, expectedPlanningCycle: 1, placeId, preference: "INTERESTED", preferredPeriod: "ANYTIME", estimatedDurationMinutes: 60, durationSource: "USER_OVERRIDE",
  }), resolver);
  const candidateRef = getFirestore().doc(`trips/${trip.tripId}/candidates/${first.candidateId}`);
  const before = (await candidateRef.get()).data();
  await removeSubmissionHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: first.candidateId }));
  await candidateRef.update({ activationVersion: FieldValue.delete(), shortlistStatus: "SHORTLISTED" });
  await getFirestore().doc(`trips/${trip.tripId}/candidateVotes/${candidateVoteId(1, first.candidateId, "member")}`).set({
    candidateId: first.candidateId,
    memberId: "member",
    value: "WANT",
    score: 1,
    planningCycle: 1,
    createdAt: before?.createdAt,
    updatedAt: before?.createdAt,
  });
  return { trip, candidateId: first.candidateId, before };
}

function submitInput(tripId: string, placeId: string) {
  return { tripId, expectedPlanningCycle: 1, placeId, preference: "INTERESTED", preferredPeriod: "ANYTIME", estimatedDurationMinutes: 60, durationSource: "USER_OVERRIDE" };
}

describeEmulator("reopenTripPhase", () => {
  beforeAll(() => { if (!getApps().length) initializeApp({ projectId: "travel-planner-reopen-test" }); });

  it("reopens COLLECTING, increments the cycle, clears basis, and preserves qualifying submissions", async () => {
    const trip = await createTripHandlerWithResolver(request("owner", {
      name: "Reopen trip", destinationPlaceId: "destination", startDate: "2026-09-01", endDate: "2026-09-03",
      baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 }, defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, primaryTransport: "WALKING", activityBudgetCurrency: "MYR",
    }), resolver);
    await joinTripHandler(request("member", { tripId: trip.tripId, inviteToken: trip.inviteToken }));
    const input = { tripId: trip.tripId, expectedPlanningCycle: 1, placeId: "candidate", preference: "INTERESTED", preferredPeriod: "ANYTIME", estimatedDurationMinutes: 60, durationSource: "USER_OVERRIDE" };
    const candidate = await submitCandidateHandlerWithResolver(request("owner", input), resolver);
    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "VOTING", votingBasisMembershipVersion: 2, selectedOptionId: "option-1" });
    expect(await reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "COLLECTING", reason: "revote" }))).toMatchObject({ phase: "COLLECTING", planningCycle: 2 });
    const stored = (await getFirestore().doc(`trips/${trip.tripId}/candidates/${candidate.candidateId}`).get()).data();
    expect(stored).toMatchObject({ active: true, shortlistStatus: "PENDING" });
    expect((await getFirestore().doc(`trips/${trip.tripId}`).get()).data()).not.toHaveProperty("votingBasisMembershipVersion");
  });

  it("rejects a direct VOTING reopen without a persisted valid basis", async () => {
    const trip = await createTripHandlerWithResolver(request("owner", {
      name: "Basis trip", destinationPlaceId: "destination", startDate: "2026-09-01", endDate: "2026-09-03",
      baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 }, defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, primaryTransport: "WALKING", activityBudgetCurrency: "MYR",
    }), resolver);
    await joinTripHandler(request("member", { tripId: trip.tripId, inviteToken: trip.inviteToken }));
    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "PLANNING" });
    await expect(reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" }))).rejects.toMatchObject({ details: { reason: "INVALID_PHASE" } });
  });

  it("serializes concurrent COLLECTING reopens into one cycle", async () => {
    const trip = await createTripHandlerWithResolver(request("owner", {
      name: "Concurrent collecting reopen", destinationPlaceId: "destination", startDate: "2026-09-01", endDate: "2026-09-03",
      baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 }, defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, primaryTransport: "WALKING", activityBudgetCurrency: "MYR",
    }), resolver);
    await joinTripHandler(request("member", { tripId: trip.tripId, inviteToken: trip.inviteToken }));
    await submitCandidateHandlerWithResolver(request("owner", {
      tripId: trip.tripId, expectedPlanningCycle: 1, placeId: "concurrent-collecting", preference: "INTERESTED", preferredPeriod: "ANYTIME", estimatedDurationMinutes: 60, durationSource: "USER_OVERRIDE",
    }), resolver);
    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "VOTING", votingBasisMembershipVersion: 2 });

    const results = await Promise.allSettled([
      reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "COLLECTING" })),
      reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "COLLECTING" })),
    ]);
    const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
    const targetVotes = await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).where("planningCycle", "==", 2).get();
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected")?.reason as { details?: { reason?: string } }).details?.reason).toBe("STALE_PLANNING_CYCLE");
    expect(storedTrip).toMatchObject({ phase: "COLLECTING", planningCycle: 2 });
    expect(storedTrip).not.toHaveProperty("votingBasisMembershipVersion");
    expect(storedTrip).not.toHaveProperty("selectedOptionId");
    expect(targetVotes.empty).toBe(true);
  }, 30_000);

  it("orders candidate reactivation before COLLECTING reopen and preserves one activation epoch", async () => {
    const fixture = await setupReactivationRace("submission-first");
    const reopenGate = barrier();
    const reopen = reopenTripPhaseHandler(request("owner", { tripId: fixture.trip.tripId, expectedPlanningCycle: 1, targetPhase: "COLLECTING" }), undefined, { beforeTransaction: reopenGate.hook });
    await reopenGate.entered;

    const submissions = await Promise.all([
      submitCandidateHandlerWithResolver(request("owner", submitInput(fixture.trip.tripId, "submission-first")), resolver),
      submitCandidateHandlerWithResolver(request("member", submitInput(fixture.trip.tripId, "submission-first")), resolver),
    ]);
    reopenGate.release();
    await expect(reopen).resolves.toMatchObject({ phase: "COLLECTING", planningCycle: 2 });

    const trip = (await getFirestore().doc(`trips/${fixture.trip.tripId}`).get()).data();
    const candidate = (await getFirestore().doc(`trips/${fixture.trip.tripId}/candidates/${fixture.candidateId}`).get()).data();
    const storedSubmissions = await getFirestore().collection(`trips/${fixture.trip.tripId}/submissions`).where("candidateId", "==", fixture.candidateId).get();
    const oldVote = await getFirestore().doc(`trips/${fixture.trip.tripId}/candidateVotes/${candidateVoteId(1, fixture.candidateId, "member")}`).get();

    expect(submissions).toHaveLength(2);
    expect(trip).toMatchObject({ phase: "COLLECTING", planningCycle: 2 });
    expect(trip).not.toHaveProperty("votingBasisMembershipVersion");
    expect(candidate).toMatchObject({ active: true, activationVersion: 2, shortlistStatus: "PENDING", firstSubmittedBy: fixture.before?.firstSubmittedBy, firstSubmittedAt: fixture.before?.firstSubmittedAt, createdAt: fixture.before?.createdAt });
    expect(storedSubmissions.docs).toHaveLength(2);
    expect(new Set(storedSubmissions.docs.map(doc => doc.id))).toEqual(new Set([`owner_${fixture.candidateId}`, `member_${fixture.candidateId}`]));
    expect((await getFirestore().collection(`trips/${fixture.trip.tripId}/candidates`).get()).docs).toHaveLength(1);
    expect((await getFirestore().collection(`trips/${fixture.trip.tripId}/candidateVotes`).get()).docs).toHaveLength(1);
    expect(oldVote.data()).toMatchObject({ value: "WANT", planningCycle: 1 });
  }, 30_000);

  it("rejects a submission made stale by an earlier COLLECTING reopen without partial reactivation", async () => {
    const fixture = await setupReactivationRace("reopen-first");
    const submissionGate = barrier();
    const staleSubmission = submitCandidateHandlerWithResolver(request("owner", submitInput(fixture.trip.tripId, "reopen-first")), resolver, { beforeTransaction: submissionGate.hook });
    await submissionGate.entered;

    const reopen = reopenTripPhaseHandler(request("owner", { tripId: fixture.trip.tripId, expectedPlanningCycle: 1, targetPhase: "COLLECTING" }));
    const results = Promise.allSettled([reopen, staleSubmission]);
    await expect(reopen).resolves.toMatchObject({ phase: "COLLECTING", planningCycle: 2 });
    submissionGate.release();
    const settled = await results;
    const trip = (await getFirestore().doc(`trips/${fixture.trip.tripId}`).get()).data();
    const candidate = (await getFirestore().doc(`trips/${fixture.trip.tripId}/candidates/${fixture.candidateId}`).get()).data();
    const submission = await getFirestore().doc(`trips/${fixture.trip.tripId}/submissions/owner_${fixture.candidateId}`).get();
    const oldVote = await getFirestore().doc(`trips/${fixture.trip.tripId}/candidateVotes/${candidateVoteId(1, fixture.candidateId, "member")}`).get();

    expect(settled[0].status).toBe("fulfilled");
    expect(settled[1].status).toBe("rejected");
    expect((settled[1].reason as { details?: { reason?: string } }).details?.reason).toBe("STALE_PLANNING_CYCLE");
    expect(trip).toMatchObject({ phase: "COLLECTING", planningCycle: 2 });
    expect(trip).not.toHaveProperty("votingBasisMembershipVersion");
    expect(candidate).toMatchObject({ active: false, shortlistStatus: "PENDING", firstSubmittedBy: fixture.before?.firstSubmittedBy, firstSubmittedAt: fixture.before?.firstSubmittedAt, createdAt: fixture.before?.createdAt });
    expect(candidate).not.toHaveProperty("activationVersion");
    expect(submission.exists).toBe(false);
    expect((await getFirestore().collection(`trips/${fixture.trip.tripId}/submissions`).get()).empty).toBe(true);
    expect(oldVote.data()).toMatchObject({ value: "WANT", planningCycle: 1 });
  }, 30_000);
});
