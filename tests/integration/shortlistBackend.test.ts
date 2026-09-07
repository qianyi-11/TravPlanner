import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { candidateIdFromPlaceId } from "../../functions/src/candidates/candidateIdentity";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import type { StoredExternalSnapshot } from "../../functions/src/integrations/externalSnapshots";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";
import type { RouteSnapshotResolver } from "../../functions/src/shortlist/representativeTravel";
import { runAuthoritativeShortlist } from "../../functions/src/shortlist";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { castCandidateVoteHandler } from "../../functions/src/voting/castCandidateVote";
import { closeVotingHandler } from "../../functions/src/voting/closeVoting";
import { startVotingHandler } from "../../functions/src/voting/startVoting";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const placeResolver: PlaceResolver = async placeId => ({
  placeId,
  name: `Place ${placeId}`,
  lat: placeId === "base" ? 3 : 4,
  lng: placeId === "base" ? 101 : 102,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: [],
});

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return { data, auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } } } as CallableRequest<unknown>;
}

function routeResolver(onFirstCall?: () => Promise<void>): RouteSnapshotResolver {
  let first = true;
  return async input => {
    if (first && onFirstCall) {
      first = false;
      await onFirstCall();
    }
    return {
      id: `${input.origin.lat}-${input.destination.lat}`,
      snapshot: {
        provider: "GOOGLE_ROUTES",
        kind: "ROUTE",
        cacheKey: JSON.stringify([input.origin, input.destination]),
        source: "SHORTLIST_TEST",
        fetchedAt: new Date(),
        freshness: "FRESH",
        data: {
          origin: input.origin,
          destination: input.destination,
          transportMode: input.transportMode,
          departureBucket: {
            date: input.departureDate,
            startMinute: Math.floor(input.departureMinute / 15) * 15,
          },
          durationMinutes: 30,
        },
      },
    } as StoredExternalSnapshot;
  };
}

async function createTrip(name = "Shortlist trip") {
  return createTripHandlerWithResolver(request("owner", {
    name,
    destinationPlaceId: "destination",
    startDate: "2026-09-01",
    endDate: "2026-09-01",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 },
    defaultDayWindow: { startTime: "09:00", endTime: "10:00" },
    primaryTransport: "WALKING",
    activityBudgetCurrency: "MYR",
  }), placeResolver);
}

async function submit(tripId: string, uid: string, placeId: string, preference: "INTERESTED" | "MUST_DO") {
  return submitCandidateHandlerWithResolver(request(uid, {
    tripId,
    expectedPlanningCycle: 1,
    placeId,
    preference,
    preferredPeriod: "ANYTIME",
    estimatedDurationMinutes: 60,
    durationSource: "USER_OVERRIDE",
  }), placeResolver);
}

async function setupGroupPlanning() {
  const trip = await createTrip();
  await joinTripHandler(request("member", { tripId: trip.tripId, inviteToken: trip.inviteToken }));
  const a = await submit(trip.tripId, "owner", "candidate-a", "INTERESTED");
  const b = await submit(trip.tripId, "owner", "candidate-b", "INTERESTED");
  const c = await submit(trip.tripId, "owner", "candidate-c", "MUST_DO");
  await startVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
  await castCandidateVoteHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: a.candidateId, value: "WANT" }));
  await castCandidateVoteHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: b.candidateId, value: "NEUTRAL" }));
  await castCandidateVoteHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1, candidateId: c.candidateId, value: "AVOID" }));
  await closeVotingHandler(request("owner", { tripId: trip.tripId, expectedPlanningCycle: 1 }));
  return { ...trip, candidateIds: [a.candidateId, b.candidateId, c.candidateId] };
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

async function candidateStatuses(tripId: string, candidateIds: string[]) {
  return Promise.all(candidateIds.map(async candidateId =>
    (await getFirestore().doc(`trips/${tripId}/candidates/${candidateId}`).get()).data()?.shortlistStatus,
  ));
}

describeEmulator("Shortlist backend", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-shortlist-test" });
  });

  it("persists deterministic group shortlist statuses and leaves inactive lifecycle untouched", async () => {
    const trip = await setupGroupPlanning();
    const inactiveId = candidateIdFromPlaceId("inactive-candidate");
    await getFirestore().doc(`trips/${trip.tripId}/candidates/${inactiveId}`).set({
      placeId: "inactive-candidate", name: "Inactive", location: { lat: 5, lng: 103 }, placeTypes: [],
      environment: "UNKNOWN", active: false, activationVersion: 1, shortlistStatus: "SHORTLISTED",
      firstSubmittedBy: "owner", firstSubmittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await runAuthoritativeShortlist({ tripId: trip.tripId, ownerId: "owner", expectedPlanningCycle: 1, routeResolver: routeResolver() });
    expect(result.mode).toBe("GROUP");
    expect(result.mustDoCandidateIds).toEqual([trip.candidateIds[2]]);
    expect(result.ordinaryRankedCandidateIds).toEqual([trip.candidateIds[0], trip.candidateIds[1]]);
    expect(result.orderedSelectedCandidateIds).toEqual([trip.candidateIds[2]]);
    expect(await candidateStatuses(trip.tripId, trip.candidateIds)).toEqual(["NOT_SHORTLISTED", "NOT_SHORTLISTED", "SHORTLISTED"]);
    expect((await getFirestore().doc(`trips/${trip.tripId}/candidates/${inactiveId}`).get()).data()?.shortlistStatus).toBe("SHORTLISTED");

    const second = await runAuthoritativeShortlist({ tripId: trip.tripId, ownerId: "owner", expectedPlanningCycle: 1, routeResolver: routeResolver() });
    expect(second.orderedSelectedCandidateIds).toEqual(result.orderedSelectedCandidateIds);
  }, 30_000);

  it("uses solo OWNER inputs without creating synthetic votes", async () => {
    const trip = await createTrip("Solo shortlist");
    const a = await submit(trip.tripId, "owner", "solo-a", "INTERESTED");
    const b = await submit(trip.tripId, "owner", "solo-b", "INTERESTED");
    const c = await submit(trip.tripId, "owner", "solo-c", "MUST_DO");
    await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "PLANNING" });
    const result = await runAuthoritativeShortlist({ tripId: trip.tripId, ownerId: "owner", expectedPlanningCycle: 1, routeResolver: routeResolver() });
    expect(result.mode).toBe("SOLO");
    expect(result.mustDoCandidateIds).toEqual([c.candidateId]);
    expect(result.ordinaryRankedCandidateIds).toEqual([a.candidateId, b.candidateId].sort());
    expect((await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).get()).empty).toBe(true);
  }, 30_000);

  it("rejects a stale membership result and commits no shortlist status", async () => {
    const trip = await setupGroupPlanning();
    const reason = await reasonOf(() => runAuthoritativeShortlist({
      tripId: trip.tripId, ownerId: "owner", expectedPlanningCycle: 1,
      routeResolver: routeResolver(async () => {
        const db = getFirestore();
        await db.doc(`trips/${trip.tripId}/members/new-member`).set({ uid: "new-member", role: "MEMBER", status: "ACTIVE", joinedAt: new Date(), updatedAt: new Date() });
        await db.doc(`trips/${trip.tripId}`).update({ membershipVersion: 3, activeMemberCount: 3 });
      }),
    }));
    expect(reason).toBe("STALE_MEMBERSHIP_VERSION");
    expect(await candidateStatuses(trip.tripId, trip.candidateIds)).toEqual(["PENDING", "PENDING", "PENDING"]);
  }, 30_000);

  it("rejects planning-cycle, phase, candidate activation, and OWNER changes during provider work", async () => {
    const cases: Array<{ mutate: (tripId: string, candidateId: string) => Promise<void>; reason: string }> = [
      { mutate: (tripId) => getFirestore().doc(`trips/${tripId}`).update({ planningCycle: 2 }), reason: "STALE_PLANNING_CYCLE" },
      { mutate: (tripId) => getFirestore().doc(`trips/${tripId}`).update({ phase: "REVIEW" }), reason: "INVALID_PHASE" },
      { mutate: (tripId, candidateId) => getFirestore().doc(`trips/${tripId}/candidates/${candidateId}`).update({ activationVersion: 2 }), reason: "CONFLICT" },
      { mutate: (tripId) => getFirestore().doc(`trips/${tripId}`).update({ ownerId: "member" }), reason: "OWNER_REQUIRED" },
    ];
    for (const testCase of cases) {
      const trip = await setupGroupPlanning();
      const reason = await reasonOf(() => runAuthoritativeShortlist({
        tripId: trip.tripId,
        ownerId: "owner",
        expectedPlanningCycle: 1,
        routeResolver: routeResolver(() => testCase.mutate(trip.tripId, trip.candidateIds[0])),
      }));
      expect(reason).toBe(testCase.reason);
    }
  }, 60_000);
});
