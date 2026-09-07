import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { candidateIdFromPlaceId } from "../../functions/src/candidates/candidateIdentity";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { leaveTripHandler } from "../../functions/src/membership/leaveTrip";
import { removeMemberHandler } from "../../functions/src/membership/removeMember";
import { castCandidateVoteHandler } from "../../functions/src/voting/castCandidateVote";
import { castOptionVoteHandler } from "../../functions/src/voting/castOptionVote";
import { closeVotingHandler } from "../../functions/src/voting/closeVoting";
import { recalculateMembershipVoteState, type MembershipCandidateVote } from "../../functions/src/voting/recalculateMembershipVoteState";
import { startVotingHandler } from "../../functions/src/voting/startVoting";
import { reopenTripPhaseHandler } from "../../functions/src/trips/reopenTripPhase";
import { type PlaceResolver } from "../../functions/src/integrations/google/places";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const resolver: PlaceResolver = async placeId => ({ placeId, name: `Place ${placeId}`, lat: 3, lng: 101, timezone: "Asia/Kuala_Lumpur", placeTypes: [] });

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return { data, auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } } } as CallableRequest<unknown>;
}

async function createTrip() {
  return createTripHandlerWithResolver(request("owner", {
    name: "Voting trip", destinationPlaceId: "destination", startDate: "2026-09-01", endDate: "2026-09-03",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, primaryTransport: "WALKING", activityBudgetCurrency: "MYR",
  }), resolver);
}

async function setupVotingTrip(memberIds: string[] = ["member"]) {
  const trip = await createTrip();
  for (const uid of memberIds) await joinTripHandler(request(uid, { tripId: trip.tripId, inviteToken: trip.inviteToken }));
  const submission = { tripId: trip.tripId, expectedPlanningCycle: 1, placeId: "candidate", preference: "INTERESTED", preferredPeriod: "ANYTIME", estimatedDurationMinutes: 60, durationSource: "USER_OVERRIDE" };
  await submitCandidateHandlerWithResolver(request("owner", submission), resolver);
  return { ...trip, candidateId: candidateIdFromPlaceId("candidate") };
}

async function setupPlanningTrip() {
  const trip = await setupVotingTrip(["member", "member-2"]);
  await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
  await closeVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
  const db = getFirestore();
  await db.doc(`trips/${trip.tripId}/itineraryOptions/option-1`).set({ planningCycle: 1, days: [] });
  await db.doc(`trips/${trip.tripId}/itineraryOptions/option-2`).set({ planningCycle: 1, days: [] });
  return trip;
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

async function activeMemberIds(tripId: string) {
  const snapshot = await getFirestore().collection(`trips/${tripId}/members`).where("status", "==", "ACTIVE").get();
  return snapshot.docs.map(doc => doc.id).sort();
}

describeEmulator("Voting backend", () => {
  beforeAll(() => { if (!getApps().length) initializeApp({ projectId: "travel-planner-voting-test" }); });

  it("starts, casts, closes, and carries candidate votes with explicit activation versions", async () => {
    const trip = await setupVotingTrip();
    expect(await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }))).toEqual({ phase: "VOTING", planningCycle: 1 });
    const vote = await castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "WANT" }));
    expect(vote).toEqual({ candidateId: trip.candidateId, value: "WANT" });
    const voteSnapshot = await getFirestore().doc(`trips/${trip.tripId}/candidateVotes/1_${trip.candidateId}_member`).get();
    expect(voteSnapshot.data()).toMatchObject({ memberId: "member", candidateId: trip.candidateId, value: "WANT", score: 1, candidateActivationVersion: 1 });
    expect(await closeVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }))).toEqual({ phase: "PLANNING", planningCycle: 1 });
    await getFirestore().doc(`trips/${trip.tripId}/itineraryOptions/option-1`).set({ planningCycle: 1, days: [] });
    expect(await castOptionVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId: "option-1" }))).toEqual({ optionId: "option-1" });
    expect(await reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" }))).toEqual({ tripId: trip.tripId, phase: "VOTING", planningCycle: 2 });
    expect((await getFirestore().doc(`trips/${trip.tripId}/candidateVotes/2_${trip.candidateId}_member`).get()).data()).toMatchObject({ planningCycle: 2, value: "WANT", score: 1, candidateActivationVersion: 1 });
  }, 30_000);

  it("allows zero-response close and rejects solo group voting", async () => {
    const trip = await setupVotingTrip();
    await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
    expect(await closeVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }))).toEqual({ phase: "PLANNING", planningCycle: 1 });
    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "COLLECTING" });
    await getFirestore().doc(`trips/${trip.tripId}/members/member`).update({ status: "REMOVED" });
    await getFirestore().doc(`trips/${trip.tripId}`).update({ activeMemberCount: 1, membershipVersion: 3 });
    await expect(startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }))).rejects.toMatchObject({ details: { reason: "NOT_APPLICABLE_FOR_SOLO" } });
  });

  it("serializes join versus startVoting against the final ACTIVE set", async () => {
    const trip = await setupVotingTrip();
    await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
    await castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "WANT" }));
    await reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "COLLECTING" }));
    const results = await Promise.allSettled([
      joinTripHandler(request("member-2", { tripId: trip.tripId, inviteToken: trip.inviteToken })),
      startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 2 })),
    ]);
    const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
    const members = await activeMemberIds(trip.tripId);
    const carriedVotes = await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).where("planningCycle", "==", 2).get();
    const joinResult = results[0];
    const startResult = results[1];

    expect(startResult.status).toBe("fulfilled");
    expect(storedTrip).toMatchObject({ phase: "VOTING", planningCycle: 2 });
    expect(storedTrip?.votingBasisMembershipVersion).toBe(storedTrip?.membershipVersion);
    expect(carriedVotes.docs).toHaveLength(1);
    expect(carriedVotes.docs[0].data()).toMatchObject({ memberId: "member", candidateId: trip.candidateId, value: "WANT", candidateActivationVersion: 1 });
    if (joinResult.status === "fulfilled") {
      expect(members).toEqual(["member", "member-2", "owner"]);
      expect(storedTrip?.membershipVersion).toBe(3);
    } else {
      expect((joinResult.reason as { details?: { reason?: string } }).details?.reason).toBe("MEMBERSHIP_FROZEN");
      expect(members).toEqual(["member", "owner"]);
      expect(storedTrip?.membershipVersion).toBe(2);
      expect((await getFirestore().doc(`users/member-2/tripMemberships/${trip.tripId}`).get()).exists).toBe(false);
    }
  }, 30_000);

  it("serializes owner removal and self-leave before startVoting when the final set becomes solo", async () => {
    for (const removalKind of ["OWNER_REMOVAL", "SELF_LEAVE"] as const) {
      const trip = await setupVotingTrip();
      const tripId = trip.tripId;
      const results = await Promise.allSettled([
        startVotingHandler(request("owner", { tripId, expectedPlanningCycle: 1 })),
        removalKind === "OWNER_REMOVAL"
          ? removeMemberHandler(request("owner", { tripId, memberId: "member", expectedPlanningCycle: 1 }))
          : leaveTripHandler(request("member", { tripId, expectedPlanningCycle: 1 })),
      ]);
      const storedTrip = (await getFirestore().doc(`trips/${tripId}`).get()).data();
      expect(storedTrip).toMatchObject({ phase: "COLLECTING", activeMemberCount: 1 });
      expect([1, 2]).toContain(storedTrip?.planningCycle);
      expect(storedTrip).not.toHaveProperty("votingBasisMembershipVersion");
      expect(await activeMemberIds(tripId)).toEqual(["owner"]);
      expect(results[1].status).toBe("fulfilled");
      const startFailure = results.find(result => result.status === "rejected");
      if (startFailure) expect((startFailure.reason as { details?: { reason?: string } }).details?.reason).toBe("NOT_APPLICABLE_FOR_SOLO");
    }
  }, 30_000);

  it("keeps a valid or stale VOTING basis when group removal races startVoting", async () => {
    for (const removalKind of ["OWNER_REMOVAL", "SELF_LEAVE"] as const) {
      const trip = await setupVotingTrip(["member", "member-2"]);
      const results = await Promise.allSettled([
        startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 })),
        removalKind === "OWNER_REMOVAL"
          ? removeMemberHandler(request("owner", { tripId: trip.tripId, memberId: "member", expectedPlanningCycle: 1 }))
          : leaveTripHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1 })),
      ]);
      const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
      expect(results.every(result => result.status === "fulfilled")).toBe(true);
      expect(storedTrip).toMatchObject({ phase: "VOTING", planningCycle: 1, membershipVersion: 4 });
      expect(await activeMemberIds(trip.tripId)).toEqual(["member-2", "owner"]);
      expect([3, 4]).toContain(storedTrip?.votingBasisMembershipVersion);
      if (storedTrip?.votingBasisMembershipVersion === 3) {
        expect(await reasonOf(() => reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" })))).toBe("STALE_MEMBERSHIP_VERSION");
      }
    }
  }, 30_000);

  it("serializes candidate vote and closeVoting without a mixed phase", async () => {
    const trip = await setupVotingTrip();
    await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
    const results = await Promise.allSettled([
      castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "WANT" })),
      closeVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 })),
    ]);
    const voteRef = getFirestore().doc(`trips/${trip.tripId}/candidateVotes/1_${trip.candidateId}_member`);
    const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
    const vote = await voteRef.get();
    expect(storedTrip?.phase).toBe("PLANNING");
    expect(results[1].status).toBe("fulfilled");
    const rejected = results.find(result => result.status === "rejected");
    if (rejected) expect((rejected.reason as { details?: { reason?: string } }).details?.reason).toBe("INVALID_PHASE");
    if (results[0].status === "fulfilled") expect(vote.data()).toMatchObject({ planningCycle: 1, value: "WANT" });
    else expect(vote.exists).toBe(false);
  }, 30_000);

  it("excludes a vote from current authority when owner removal races the vote", async () => {
    for (const removalKind of ["OWNER_REMOVAL", "SELF_LEAVE"] as const) {
      const trip = await setupVotingTrip(["member", "member-2"]);
      await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
      const results = await Promise.allSettled([
        castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "WANT" })),
        removalKind === "OWNER_REMOVAL"
          ? removeMemberHandler(request("owner", { tripId: trip.tripId, memberId: "member", expectedPlanningCycle: 1 }))
          : leaveTripHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1 })),
      ]);
      const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
      const candidate = (await getFirestore().doc(`trips/${trip.tripId}/candidates/${trip.candidateId}`).get()).data();
      const votes = await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).where("planningCycle", "==", 1).get();
      const state = recalculateMembershipVoteState({
        candidateVotes: votes.docs.map(doc => doc.data() as MembershipCandidateVote),
        optionVotes: [],
        activeMemberIds: ["member-2", "owner"],
        planningCycle: 1,
        candidates: [{ candidateId: trip.candidateId, active: candidate?.active === true, activationVersion: candidate?.activationVersion ?? 1 }],
      });
      expect(results[1].status).toBe("fulfilled");
      expect(["VOTING", "COLLECTING"]).toContain(storedTrip?.phase);
      expect(storedTrip).toMatchObject({ activeMemberCount: 2, membershipVersion: 4 });
      if (storedTrip?.phase === "COLLECTING") expect(storedTrip.planningCycle).toBe(2);
      expect(state.candidateAggregates[trip.candidateId]?.scoreTotal ?? 0).toBe(0);
      expect(state.candidateAggregates[trip.candidateId]?.responseCount ?? 0).toBe(0);
      expect(state.candidateAggregates[trip.candidateId]?.wantCount ?? 0).toBe(0);
      if (results[0].status === "rejected") expect((results[0].reason as { details?: { reason?: string } }).details?.reason).toBe("MEMBER_INACTIVE");
    }
  }, 30_000);

  it("excludes a removed member's option vote from plurality", async () => {
    for (const removalKind of ["OWNER_REMOVAL", "SELF_LEAVE"] as const) {
      const trip = await setupPlanningTrip();
      await castOptionVoteHandler(request("member-2", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId: "option-1" }));
      const results = await Promise.allSettled([
        castOptionVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId: "option-2" })),
        removalKind === "OWNER_REMOVAL"
          ? removeMemberHandler(request("owner", { tripId: trip.tripId, memberId: "member", expectedPlanningCycle: 1 }))
          : leaveTripHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1 })),
      ]);
      const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
      const optionVotes = await getFirestore().collection(`trips/${trip.tripId}/optionVotes`).get();
      const state = recalculateMembershipVoteState({
        candidateVotes: [],
        optionVotes: optionVotes.docs.map(doc => doc.data()),
        activeMemberIds: ["member-2", "owner"],
        planningCycle: 1,
        eligibleOptionIds: ["option-1", "option-2"],
      });
      expect(results[1].status).toBe("fulfilled");
      expect(["PLANNING", "COLLECTING"]).toContain(storedTrip?.phase);
      expect(storedTrip).toMatchObject({ activeMemberCount: 2, membershipVersion: 4 });
      if (storedTrip?.phase === "COLLECTING") expect(storedTrip.planningCycle).toBe(2);
      expect(state.optionTotals).toEqual({ "option-1": 1, "option-2": 0 });
      if (results[0].status === "rejected") expect((results[0].reason as { details?: { reason?: string } }).details?.reason).toBe("MEMBER_INACTIVE");
    }
  }, 30_000);

  it("carries the winning race outcome while reopenTripPhase competes with a candidate vote", async () => {
    const trip = await setupVotingTrip();
    await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
    await castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "NEUTRAL" }));
    const results = await Promise.allSettled([
      castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "WANT" })),
      reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" })),
    ]);
    const targetVotes = await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).where("planningCycle", "==", 2).get();
    const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
    expect(storedTrip).toMatchObject({ phase: "VOTING", planningCycle: 2, votingBasisMembershipVersion: 2 });
    expect(targetVotes.docs).toHaveLength(1);
    expect(targetVotes.docs[0].data()).toMatchObject({ memberId: "member", candidateId: trip.candidateId, candidateActivationVersion: 1 });
    expect(["NEUTRAL", "WANT"]).toContain(targetVotes.docs[0].data().value);
    const rejected = results.find(result => result.status === "rejected");
    if (rejected) expect(["STALE_PLANNING_CYCLE", "INVALID_PHASE"]).toContain((rejected.reason as { details?: { reason?: string } }).details?.reason);
  }, 30_000);

  it("serializes concurrent VOTING reopens into one target cycle", async () => {
    const trip = await setupVotingTrip();
    await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
    await getFirestore().doc(`trips/${trip.tripId}/candidates/${trip.candidateId}`).update({ shortlistStatus: "SHORTLISTED" });
    await getFirestore().doc(`trips/${trip.tripId}`).update({ selectedOptionId: "option-1" });
    const results = await Promise.allSettled([
      reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" })),
      reopenTripPhaseHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" })),
    ]);
    const storedTrip = (await getFirestore().doc(`trips/${trip.tripId}`).get()).data();
    const targetVotes = await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).where("planningCycle", "==", 2).get();
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected")?.reason as { details?: { reason?: string } }).details?.reason).toBe("STALE_PLANNING_CYCLE");
    expect(storedTrip).toMatchObject({ phase: "VOTING", planningCycle: 2, votingBasisMembershipVersion: 2 });
    expect(storedTrip).not.toHaveProperty("selectedOptionId");
    expect((await getFirestore().doc(`trips/${trip.tripId}/candidates/${trip.candidateId}`).get()).data()).toMatchObject({ shortlistStatus: "PENDING" });
    expect(targetVotes.docs).toHaveLength(0);
  }, 30_000);

  it("keeps concurrent candidate-vote replacements canonical and same-value replay stable", async () => {
    const trip = await setupVotingTrip();
    await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
    const results = await Promise.allSettled([
      castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "WANT" })),
      castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value: "AVOID" })),
    ]);
    const voteRef = getFirestore().doc(`trips/${trip.tripId}/candidateVotes/1_${trip.candidateId}_member`);
    const voteAfterRace = await voteRef.get();
    const createdAt = voteAfterRace.data()?.createdAt;
    const updatedAt = voteAfterRace.data()?.updatedAt;
    const value = voteAfterRace.data()?.value;
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect(["WANT", "AVOID"]).toContain(value);
    expect(voteAfterRace.data()).toMatchObject({ memberId: "member", candidateId: trip.candidateId, planningCycle: 1, candidateActivationVersion: 1, score: value === "WANT" ? 1 : -1 });
    expect((await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).get()).size).toBe(1);
    await Promise.all([
      castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value })),
      castCandidateVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: trip.candidateId, value })),
    ]);
    expect((await voteRef.get()).data()).toMatchObject({ createdAt, updatedAt });
    expect(updatedAt).toEqual((await voteRef.get()).data()?.updatedAt);
    expect(createdAt).toBeDefined();
  }, 30_000);

  it("keeps concurrent option-vote replacements canonical and same-option replay stable", async () => {
    const trip = await setupPlanningTrip();
    const results = await Promise.allSettled([
      castOptionVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId: "option-1" })),
      castOptionVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId: "option-2" })),
    ]);
    const voteRef = getFirestore().doc(`trips/${trip.tripId}/optionVotes/member`);
    const voteAfterRace = await voteRef.get();
    const updatedAt = voteAfterRace.data()?.updatedAt;
    const optionId = voteAfterRace.data()?.optionId;
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect(["option-1", "option-2"]).toContain(optionId);
    expect(voteAfterRace.data()).toMatchObject({ memberId: "member", planningCycle: 1, optionId });
    expect((await getFirestore().collection(`trips/${trip.tripId}/optionVotes`).get()).size).toBe(1);
    await Promise.all([
      castOptionVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId })),
      castOptionVoteHandler(request("member", { tripId: trip.tripId, expectedPlanningCycle: 1, optionId })),
    ]);
    expect((await voteRef.get()).data()?.updatedAt).toEqual(updatedAt);
  }, 30_000);
});
