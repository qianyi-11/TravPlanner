import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { proposeCriticalFactHandler } from "../../functions/src/validation/proposeCriticalFact";
import {
  confirmCriticalFactHandlerWithPlaceDetails,
  type PlaceDetailsSnapshotResolver,
} from "../../functions/src/validation/confirmCriticalFact";
import { externalSnapshotSchema } from "@travel-planner/shared";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = runWithEmulator ? describe : describe.skip;

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return {
    data,
    auth: {
      uid,
      token: {
        name: `User ${uid}`,
        firebase: { sign_in_provider: "google.com" },
      },
    },
  } as CallableRequest<unknown>;
}

const placeResolver: PlaceResolver = async placeId => ({
  placeId,
  name: placeId,
  lat: 3.139,
  lng: 101.6869,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: ["tourist_attraction"],
});

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

async function setupPlanningTrip() {
  const trip = await createTripHandlerWithResolver(
    request("owner", {
      name: "Critical Facts",
      destinationPlaceId: "destination",
      startDate: "2026-10-05",
      endDate: "2026-10-06",
      baseLocation: {
        source: "GOOGLE_PLACES",
        placeId: "base",
        name: "Base",
        lat: 3.139,
        lng: 101.6869,
      },
      defaultDayWindow: { startTime: "09:00", endTime: "20:00" },
      primaryTransport: "WALKING",
      activityBudgetCurrency: "MYR",
    }),
    placeResolver,
  );
  await joinTripHandler(request("member", {
    tripId: trip.tripId,
    inviteToken: trip.inviteToken,
  }));
  const submitted = await submitCandidateHandlerWithResolver(
    request("owner", {
      tripId: trip.tripId,
      expectedPlanningCycle: 1,
      placeId: "candidate-place",
      preference: "INTERESTED",
      preferredPeriod: "ANYTIME",
      estimatedDurationMinutes: 60,
      durationSource: "USER_OVERRIDE",
    }),
    placeResolver,
  );
  await getFirestore().collection("trips").doc(trip.tripId).update({ phase: "PLANNING" });
  return { tripId: trip.tripId, candidateId: submitted.candidateId };
}

const storedPlaceDetailsResolver: PlaceDetailsSnapshotResolver = async input => {
  const ref = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("externalSnapshots")
    .doc();
  const snapshot = externalSnapshotSchema.parse({
    provider: "GOOGLE_PLACES",
    kind: "PLACE_DETAILS",
    cacheKey: JSON.stringify([
      "PLACE_DETAILS",
      input.placeId,
      input.tripTimezone,
      input.tripStartDate,
      input.tripEndDate,
    ]),
    source: "TEST_GOOGLE_PLACES",
    fetchedAt: Timestamp.now(),
    freshness: "FRESH",
    data: {
      placeId: input.placeId,
      location: { lat: 3.139, lng: 101.6869 },
      placeTypes: ["tourist_attraction"],
      visitWindows: [
        { date: "2026-10-05", startMinute: 540, endMinute: 1200 },
        { date: "2026-10-06", startMinute: 540, endMinute: 1200 },
      ],
    },
  });
  await ref.create(snapshot);
  return { id: ref.id, snapshot };
};

describeEmulator("Critical Fact backend integration", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-critical-facts-test" });
  });

  it("allows ACTIVE MEMBER proposal but requires aligned OWNER confirmation", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    const proposal = await proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 90 },
    }));
    expect(proposal.status).toBe("PENDING");

    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("member", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      storedPlaceDetailsResolver,
    ))).toBe("OWNER_REQUIRED");

    const confirmed = await confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      storedPlaceDetailsResolver,
    );
    expect(confirmed).toMatchObject({
      proposalId: proposal.proposalId,
      status: "CONFIRMED",
      changed: true,
    });
    expect(confirmed.validationSnapshotId).toBeTruthy();
    const db = getFirestore();
    const tripAfterConfirm = await db.collection("trips").doc(tripId).get();
    expect(tripAfterConfirm.data()?.phase).toBe("PLANNING");
    const validationSnapshot = await db.collection("trips").doc(tripId)
      .collection("validationSnapshots").doc(confirmed.validationSnapshotId!).get();
    expect(validationSnapshot.exists).toBe(true);
    const confirmedFacts = await db.collection("trips").doc(tripId)
      .collection("externalSnapshots").where("provider", "==", "USER_CONFIRMED").get();
    expect(confirmedFacts.docs).toHaveLength(1);
    expect(confirmedFacts.docs[0].data()).toMatchObject({
      submittedBy: "member",
      confirmedBy: "owner",
      data: { type: "DURATION", durationMinutes: 90 },
    });

    const replay = await confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      storedPlaceDetailsResolver,
    );
    expect(replay).toEqual({
      proposalId: proposal.proposalId,
      status: "CONFIRMED",
      changed: false,
    });
    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "REJECT",
      }),
      storedPlaceDetailsResolver,
    ))).toBe("CONFLICT");
  }, 20000);

  it("blocks confirmation of an older same-scope proposal while a newer PENDING proposal exists", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    const older = await proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 70 },
    }));
    const newer = await proposeCriticalFactHandler(request("owner", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 100 },
    }));
    const proposals = getFirestore().collection("trips").doc(tripId).collection("criticalFactProposals");
    await proposals.doc(older.proposalId).update({
      createdAt: Timestamp.fromMillis(1_000),
      updatedAt: Timestamp.fromMillis(1_000),
    });
    await proposals.doc(newer.proposalId).update({
      createdAt: Timestamp.fromMillis(2_000),
      updatedAt: Timestamp.fromMillis(2_000),
    });

    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: older.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      storedPlaceDetailsResolver,
    ))).toBe("CONFLICT");

    const result = await confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: newer.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      storedPlaceDetailsResolver,
    );
    expect(result.status).toBe("CONFIRMED");
  }, 20000);

  it("binds PRICE to current currency and rejects a currency race", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    const proposal = await proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "PRICE", amount: 12.34, costStatus: "ESTIMATED" },
    }));
    const persisted = await getFirestore()
      .collection("trips").doc(tripId)
      .collection("criticalFactProposals").doc(proposal.proposalId).get();
    expect(persisted.data()?.fact.currency).toBe("MYR");

    await getFirestore().collection("trips").doc(tripId).update({ activityBudgetCurrency: "SGD" });
    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      storedPlaceDetailsResolver,
    ))).toBe("CONFLICT");
  }, 20000);

  it("rejects stale membership and planning-cycle authority after provider work", async () => {
    const membershipCase = await setupPlanningTrip();
    const membershipProposal = await proposeCriticalFactHandler(request("member", {
      tripId: membershipCase.tripId,
      candidateId: membershipCase.candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 80 },
    }));
    const membershipRaceResolver: PlaceDetailsSnapshotResolver = async input => {
      const db = getFirestore();
      await db.collection("trips").doc(input.tripId).collection("members").doc("late-member").set({
        uid: "late-member",
        role: "MEMBER",
        status: "ACTIVE",
        joinedAt: Timestamp.now(),
      });
      await db.collection("trips").doc(input.tripId).update({
        membershipVersion: 3,
        activeMemberCount: 3,
      });
      return storedPlaceDetailsResolver(input);
    };
    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId: membershipCase.tripId,
        proposalId: membershipProposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      membershipRaceResolver,
    ))).toBe("STALE_MEMBERSHIP_VERSION");

    const cycleCase = await setupPlanningTrip();
    const cycleProposal = await proposeCriticalFactHandler(request("member", {
      tripId: cycleCase.tripId,
      candidateId: cycleCase.candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 80 },
    }));
    const cycleRaceResolver: PlaceDetailsSnapshotResolver = async input => {
      await getFirestore().collection("trips").doc(input.tripId).update({ planningCycle: 2 });
      return storedPlaceDetailsResolver(input);
    };
    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId: cycleCase.tripId,
        proposalId: cycleProposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "CONFIRM",
      }),
      cycleRaceResolver,
    ))).toBe("STALE_PLANNING_CYCLE");
  }, 30000);

  it("REJECT is idempotent and does not fetch provider data", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    const proposal = await proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "VISIT_WINDOW", date: "2026-10-05", startTime: "10:00", endTime: "12:00" },
    }));
    const resolver = vi.fn(storedPlaceDetailsResolver);
    const rejected = await confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "REJECT",
      }),
      resolver,
    );
    expect(rejected).toEqual({ proposalId: proposal.proposalId, status: "REJECTED", changed: true });
    expect(resolver).not.toHaveBeenCalled();

    const replay = await confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedPlanningCycle: 1,
        decision: "REJECT",
      }),
      resolver,
    );
    expect(replay.changed).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
  }, 20000);

  it("rejects malformed candidate identity when proposing a Critical Fact", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    await getFirestore().collection("trips").doc(tripId)
      .collection("candidates").doc(candidateId).update({ placeId: "different-place" });

    expect(await reasonOf(() => proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 80 },
    })))).toBe("CONFLICT");
  }, 20000);

  it("uses itinerary-version authority in FINALIZED and rejects a version race", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    const tripRef = getFirestore().collection("trips").doc(tripId);
    await tripRef.update({
      phase: "FINALIZED",
      currentItineraryVersionId: "version-1",
    });

    expect(await reasonOf(() => proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 80 },
    })))).toBe("INVALID_INPUT");

    const proposal = await proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedItineraryVersionId: "version-1",
      fact: { type: "DURATION", durationMinutes: 80 },
    }));
    const resolver: PlaceDetailsSnapshotResolver = async input => {
      await tripRef.update({ currentItineraryVersionId: "version-2" });
      return storedPlaceDetailsResolver(input);
    };

    expect(await reasonOf(() => confirmCriticalFactHandlerWithPlaceDetails(
      request("owner", {
        tripId,
        proposalId: proposal.proposalId,
        expectedItineraryVersionId: "version-1",
        decision: "CONFIRM",
      }),
      resolver,
    ))).toBe("STALE_ITINERARY_VERSION");
  }, 20000);

  it("enforces active membership and phase before proposal writes", async () => {
    const { tripId, candidateId } = await setupPlanningTrip();
    await getFirestore().collection("trips").doc(tripId).collection("members").doc("member").update({
      status: "REMOVED",
    });
    expect(await reasonOf(() => proposeCriticalFactHandler(request("member", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 80 },
    })))).toBe("MEMBER_INACTIVE");

    await getFirestore().collection("trips").doc(tripId).update({ phase: "COLLECTING" });
    expect(await reasonOf(() => proposeCriticalFactHandler(request("owner", {
      tripId,
      candidateId,
      expectedPlanningCycle: 1,
      fact: { type: "DURATION", durationMinutes: 80 },
    })))).toBe("INVALID_PHASE");
  }, 20000);

});
