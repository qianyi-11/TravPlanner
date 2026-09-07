import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import type { StoredExternalSnapshot } from "../../functions/src/integrations/externalSnapshots";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";
import { buildRouteCacheKey, routeDepartureBucket } from "../../functions/src/integrations/routeCacheKey";
import { runAuthoritativePlanning } from "../../functions/src/planning";
import { applyMinorEditHandler } from "../../functions/src/review/applyMinorEdit";
import { finalizeTripHandler } from "../../functions/src/review/finalizeTrip";
import { selectWinningOptionHandler } from "../../functions/src/review/selectWinningOption";
import { submitApprovalHandler } from "../../functions/src/review/submitApproval";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { buildPlaceDetailsCacheKey } from "../../functions/src/validation";
import { itineraryVersionDocumentSchema, validationSnapshotDocumentSchema } from "@travel-planner/shared";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return { data, auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } } } as CallableRequest<unknown>;
}

const placeResolver: PlaceResolver = async placeId => ({
  placeId,
  name: `Place ${placeId}`,
  lat: placeId === "base" ? 3 : 3.1,
  lng: placeId === "base" ? 101 : 101.1,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: [],
});

function providers() {
  return {
    placeDetailsResolver: async (input: {
      tripId: string;
      placeId: string;
      tripTimezone: string;
      tripStartDate: string;
      tripEndDate: string;
    }) => {
      const id = `place-${input.placeId}-${Math.random().toString(36).slice(2)}`;
      const snapshot = {
        provider: "GOOGLE_PLACES" as const,
        kind: "PLACE_DETAILS" as const,
        cacheKey: buildPlaceDetailsCacheKey({
          placeId: input.placeId,
          timezone: input.tripTimezone,
          startDate: input.tripStartDate,
          endDate: input.tripEndDate,
        }),
        source: "REVIEW_TEST",
        fetchedAt: Timestamp.now(),
        freshness: "FRESH" as const,
        data: {
          placeId: input.placeId,
          location: { lat: 3.1, lng: 101.1 },
          placeTypes: [],
          visitWindows: [{ date: "2026-10-01", startMinute: 9 * 60, endMinute: 18 * 60 }],
        },
      };
      await getFirestore().doc(`trips/${input.tripId}/externalSnapshots/${id}`).set(snapshot);
      return { id, snapshot } as StoredExternalSnapshot;
    },
    routeResolver: async (input: {
      tripId: string;
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
      transportMode: "WALKING" | "DRIVING" | "TRANSIT";
      departureDate: string;
      departureMinute: number;
      tripTimezone: string;
    }) => {
      const departureBucket = routeDepartureBucket({ date: input.departureDate, departureMinute: input.departureMinute });
      const data = {
        origin: input.origin,
        destination: input.destination,
        transportMode: input.transportMode,
        departureBucket,
        durationMinutes: 10,
      };
      const id = `route-${Math.random().toString(36).slice(2)}`;
      const snapshot = {
        provider: "GOOGLE_ROUTES" as const,
        kind: "ROUTE" as const,
        cacheKey: buildRouteCacheKey(data),
        source: "REVIEW_TEST",
        fetchedAt: Timestamp.now(),
        freshness: "FRESH" as const,
        data,
      };
      await getFirestore().doc(`trips/${input.tripId}/externalSnapshots/${id}`).set(snapshot);
      return { id, snapshot } as StoredExternalSnapshot;
    },
  };
}

async function createSoloReviewTrip() {
  const trip = await createTripHandlerWithResolver(request("owner", {
    name: "Review trip",
    destinationPlaceId: "destination",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3, lng: 101 },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
    primaryTransport: "DRIVING",
    activityBudgetCurrency: "MYR",
  }), placeResolver);
  await submitCandidateHandlerWithResolver(request("owner", {
    tripId: trip.tripId,
    expectedPlanningCycle: 1,
    placeId: "activity",
    preference: "INTERESTED",
    preferredPeriod: "ANYTIME",
    estimatedDurationMinutes: 60,
    durationSource: "USER_OVERRIDE",
  }), placeResolver);
  const planning = await runAuthoritativePlanning({
    tripId: trip.tripId,
    ownerId: "owner",
    expectedPlanningCycle: 1,
    ...providers(),
  });
  const optionId = planning.optionIds[0];
  await selectWinningOptionHandler(request("owner", {
    tripId: trip.tripId,
    expectedPlanningCycle: 1,
    selectedOptionId: optionId,
  }));
  return { tripId: trip.tripId, optionId };
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

async function seedGroupReviewTrip() {
  const db = getFirestore();
  const tripRef = db.collection("trips").doc();
  await tripRef.set({
    ownerId: "owner",
    phase: "REVIEW",
    planningCycle: 1,
    membershipVersion: 3,
    activeMemberCount: 3,
    updatedAt: Timestamp.now(),
  });
  for (const [uid, role] of [["owner", "OWNER"], ["member", "MEMBER"], ["member-2", "MEMBER"]] as const) {
    await tripRef.collection("members").doc(uid).set({ uid, role, status: "ACTIVE" });
  }
  const days = [{
    date: "2026-10-01",
    items: [{
      itemId: "item-1",
      candidateId: "candidate-1",
      title: "Activity",
      date: "2026-10-01",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
    }],
  }];
  await tripRef.collection("validationSnapshots").doc("option-validation").set({
    planningCycle: 1,
    scope: "ITINERARY_OPTION",
    targetId: "option-1",
    result: "NEEDS_CONFIRMATION",
    schedulable: true,
    reasonCodes: ["PRICE_UNKNOWN"],
    hardChecks: [{ check: "PRICE", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" }],
    externalSnapshotIds: [],
    checkedAt: Timestamp.now(),
  });
  await tripRef.collection("reviewDrafts").doc("1").set({
    planningCycle: 1,
    sourceOptionId: "option-1",
    revision: 1,
    days,
    validationSnapshotId: "option-validation",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    updatedBy: "owner",
  });
  await tripRef.collection("approvals").doc("final-approval").set({
    type: "FINAL_ITINERARY",
    planningCycle: 1,
    subjectType: "REVIEW_DRAFT",
    subjectId: "1",
    subjectRevision: 1,
    status: "PENDING",
    yesCount: 0,
    noCount: 0,
    createdBy: "owner",
    createdAt: Timestamp.now(),
  });
  return tripRef;
}

describeEmulator("Review editing, approvals, and finalization", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-review-finalization-test" });
  });

  it("revalidates a solo timing edit, persists a new Review snapshot, and finalizes idempotently", async () => {
    const { tripId } = await createSoloReviewTrip();
    const db = getFirestore();
    const draftRef = db.doc(`trips/${tripId}/reviewDrafts/1`);
    const before = (await draftRef.get()).data()!;
    const item = before.days[0].items[0];

    const editResult = await applyMinorEditHandler(request("owner", {
      tripId,
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 1,
      edit: { type: "MOVE_ITEM", itemId: item.itemId, targetDate: "2026-10-01", targetStartTime: "09:30" },
    }), providers());

    expect(editResult.reviewDraftRevision).toBe(2);
    expect(editResult.approvalId).toBeUndefined();
    const edited = (await draftRef.get()).data()!;
    expect(edited.days[0].items[0]).toMatchObject({ startTime: "09:30", endTime: "10:30", durationMinutes: 60 });
    const validation = validationSnapshotDocumentSchema.parse(
      (await db.doc(`trips/${tripId}/validationSnapshots/${editResult.validationSnapshotId}`).get()).data(),
    );
    expect(validation).toMatchObject({ scope: "REVIEW_DRAFT", targetId: "1", schedulable: true });
    expect(validation.result).toBe("NEEDS_CONFIRMATION");
    expect(validation.reasonCodes).toContain("PRICE_UNKNOWN");
    expect((await db.collection(`trips/${tripId}/approvals`).get()).empty).toBe(true);

    const first = await finalizeTripHandler(request("owner", {
      tripId,
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 2,
    }));
    expect(first.phase).toBe("FINALIZED");
    const version = itineraryVersionDocumentSchema.parse(
      (await db.doc(`trips/${tripId}/itineraryVersions/${first.versionId}`).get()).data(),
    );
    expect(version).toMatchObject({ versionNumber: 1, source: "FINALIZATION", sourceReviewDraftRevision: 2 });
    const versionValidation = validationSnapshotDocumentSchema.parse(
      (await db.doc(`trips/${tripId}/validationSnapshots/${version.validationSnapshotId}`).get()).data(),
    );
    expect(versionValidation).toMatchObject({
      scope: "ITINERARY_VERSION",
      targetId: first.versionId,
      result: "NEEDS_CONFIRMATION",
      schedulable: true,
    });

    const countBeforeReplay = (await db.collection(`trips/${tripId}/itineraryVersions`).get()).size;
    const replay = await finalizeTripHandler(request("owner", {
      tripId,
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 2,
    }));
    expect(replay).toEqual(first);
    expect((await db.collection(`trips/${tripId}/itineraryVersions`).get()).size).toBe(countBeforeReplay);
  }, 30_000);

  it("does not let CHANGE_DURATION bypass authoritative candidate duration", async () => {
    const { tripId } = await createSoloReviewTrip();
    const draft = (await getFirestore().doc(`trips/${tripId}/reviewDrafts/1`).get()).data()!;
    const itemId = draft.days[0].items[0].itemId;
    expect(await reasonOf(() => applyMinorEditHandler(request("owner", {
      tripId,
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 1,
      edit: { type: "CHANGE_DURATION", itemId, durationMinutes: 30 },
    }), providers()))).toBe("VALIDATION_FAILED");
    expect((await getFirestore().doc(`trips/${tripId}/reviewDrafts/1`).get()).data()?.revision).toBe(1);
  }, 30_000);

  it("calculates group approval from current ACTIVE members and finalizes a schedulable current revision", async () => {
    const tripRef = await seedGroupReviewTrip();
    const first = await submitApprovalHandler(request("owner", {
      tripId: tripRef.id,
      approvalId: "final-approval",
      decision: "APPROVE",
    }));
    expect(first).toMatchObject({ status: "PENDING", yesCount: 1, noCount: 0, requiredApprovalCount: 2 });

    const second = await submitApprovalHandler(request("member", {
      tripId: tripRef.id,
      approvalId: "final-approval",
      decision: "APPROVE",
    }));
    expect(second).toMatchObject({ status: "APPROVED", yesCount: 2, noCount: 0, requiredApprovalCount: 2 });

    const result = await finalizeTripHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 1,
    }));
    expect(result).toMatchObject({ versionNumber: 1, phase: "FINALIZED" });
    expect((await tripRef.get()).data()).toMatchObject({ phase: "FINALIZED", currentItineraryVersionId: result.versionId });
  });

  it("requires current majority and rejects group approval for solo trips", async () => {
    const groupRef = await seedGroupReviewTrip();
    await submitApprovalHandler(request("owner", {
      tripId: groupRef.id,
      approvalId: "final-approval",
      decision: "APPROVE",
    }));
    expect(await reasonOf(() => finalizeTripHandler(request("owner", {
      tripId: groupRef.id,
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 1,
    })))).toBe("MAJORITY_REQUIRED");

    const { tripId } = await createSoloReviewTrip();
    expect(await reasonOf(() => submitApprovalHandler(request("owner", {
      tripId,
      approvalId: "anything",
      decision: "APPROVE",
    })))).toBe("NOT_APPLICABLE_FOR_SOLO");
  }, 30_000);
});
