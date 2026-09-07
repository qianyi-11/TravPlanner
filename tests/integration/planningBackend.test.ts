import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import type { StoredExternalSnapshot } from "../../functions/src/integrations/externalSnapshots";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";
import { buildRouteCacheKey, routeDepartureBucket } from "../../functions/src/integrations/routeCacheKey";
import { runAuthoritativePlanning } from "../../functions/src/planning";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { buildPlaceDetailsCacheKey } from "../../functions/src/validation";
import { itineraryOptionDocumentSchema, validationSnapshotDocumentSchema } from "@travel-planner/shared";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const placeResolver: PlaceResolver = async placeId => ({
  placeId,
  name: `Place ${placeId}`,
  lat: placeId === "base" ? 3 : 3.1,
  lng: placeId === "base" ? 101 : 101.1,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: [],
});

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return {
    data,
    auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } },
  } as CallableRequest<unknown>;
}

async function createSoloTrip(name = "Planning trip") {
  return createTripHandlerWithResolver(request("owner", {
    name,
    destinationPlaceId: "destination",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    baseLocation: {
      source: "GOOGLE_PLACES",
      placeId: "base",
      name: "Base",
      lat: 3,
      lng: 101,
    },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
    primaryTransport: "DRIVING",
    activityBudgetCurrency: "MYR",
  }), placeResolver);
}

async function submit(tripId: string, placeId = "activity", preference: "INTERESTED" | "MUST_DO" = "INTERESTED") {
  return submitCandidateHandlerWithResolver(request("owner", {
    tripId,
    expectedPlanningCycle: 1,
    placeId,
    preference,
    preferredPeriod: "ANYTIME",
    estimatedDurationMinutes: 60,
    durationSource: "USER_OVERRIDE",
  }), placeResolver);
}

function providerResolvers(hooks?: {
  onFirstRoute?: () => Promise<void>;
  onFirstPlaceDetails?: () => Promise<void>;
}) {
  let firstRoute = true;
  let firstPlaceDetails = true;
  return {
    placeDetailsResolver: async (input: {
      tripId: string;
      placeId: string;
      tripTimezone: string;
      tripStartDate: string;
      tripEndDate: string;
    }) => {
      if (firstPlaceDetails && hooks?.onFirstPlaceDetails) {
        firstPlaceDetails = false;
        await hooks.onFirstPlaceDetails();
      }
      const id = `place-${input.placeId}`;
      const snapshot = {
        provider: "GOOGLE_PLACES" as const,
        kind: "PLACE_DETAILS" as const,
        cacheKey: buildPlaceDetailsCacheKey({
          placeId: input.placeId,
          timezone: input.tripTimezone,
          startDate: input.tripStartDate,
          endDate: input.tripEndDate,
        }),
        source: "PLANNING_TEST",
        fetchedAt: Timestamp.now(),
        freshness: "FRESH" as const,
        data: {
          placeId: input.placeId,
          location: { lat: 3.1, lng: 101.1 },
          placeTypes: [],
          visitWindows: [{
            date: "2026-10-01",
            startMinute: 9 * 60,
            endMinute: 18 * 60,
          }],
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
      if (firstRoute && hooks?.onFirstRoute) {
        firstRoute = false;
        await hooks.onFirstRoute();
      }
      const departureBucket = routeDepartureBucket({
        date: input.departureDate,
        departureMinute: input.departureMinute,
      });
      const id = `route-${Math.random().toString(36).slice(2)}`;
      const data = {
        origin: input.origin,
        destination: input.destination,
        transportMode: input.transportMode,
        departureBucket,
        durationMinutes: 10,
      };
      const snapshot = {
        provider: "GOOGLE_ROUTES" as const,
        kind: "ROUTE" as const,
        cacheKey: buildRouteCacheKey(data),
        source: "PLANNING_TEST",
        fetchedAt: Timestamp.now(),
        freshness: "FRESH" as const,
        data,
      };
      await getFirestore().doc(`trips/${input.tripId}/externalSnapshots/${id}`).set(snapshot);
      return { id, snapshot } as StoredExternalSnapshot;
    },
  };
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

describeEmulator("Planning backend", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-planning-test" });
  });

  it("atomically enters solo PLANNING, persists only Validator-accepted immutable options, and reuses them idempotently", async () => {
    const trip = await createSoloTrip();
    await submit(trip.tripId, "solo-activity", "MUST_DO");
    const providers = providerResolvers();

    const first = await runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      ...providers,
    });
    expect(first.planningCycle).toBe(1);
    expect(first.optionIds.length).toBeGreaterThan(0);
    expect(first.optionIds.length).toBeLessThanOrEqual(3);
    expect(first.reusedExistingOptions).toBe(false);
    expect((await getFirestore().doc(`trips/${trip.tripId}`).get()).data()?.phase).toBe("PLANNING");
    expect((await getFirestore().collection(`trips/${trip.tripId}/candidateVotes`).get()).empty).toBe(true);
    expect((await getFirestore().collection(`trips/${trip.tripId}/optionVotes`).get()).empty).toBe(true);

    for (const optionId of first.optionIds) {
      const optionSnapshot = await getFirestore().doc(`trips/${trip.tripId}/itineraryOptions/${optionId}`).get();
      const option = itineraryOptionDocumentSchema.parse(optionSnapshot.data());
      expect(option.planningCycle).toBe(1);
      expect(option.days.flatMap(day => day.items).some(item => item.candidateId)).toBe(true);
      expect(option.score.preferredPeriod).toBe(0);
      const validation = validationSnapshotDocumentSchema.parse(
        (await getFirestore().doc(`trips/${trip.tripId}/validationSnapshots/${option.validationSnapshotId}`).get()).data(),
      );
      expect(validation.scope).toBe("ITINERARY_OPTION");
      expect(validation.targetId).toBe(optionId);
      expect(validation.result).toBe("NEEDS_CONFIRMATION");
      expect(validation.schedulable).toBe(true);
      expect(validation.reasonCodes).toEqual(["PRICE_UNKNOWN"]);
      expect(validation.hardChecks.find(check => check.check === "ROUTE_TIME")).toEqual({
        check: "ROUTE_TIME",
        status: "PASS",
      });
      expect(validation.hardChecks.find(check => check.check === "PRICE")).toEqual({
        check: "PRICE",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "PRICE_UNKNOWN",
      });
    }

    const optionCountBeforeReplay = (await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).size;
    const validationCountBeforeReplay = (await getFirestore().collection(`trips/${trip.tripId}/validationSnapshots`).get()).size;
    const second = await runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      placeDetailsResolver: async () => { throw new Error("idempotent reuse should not call Places"); },
      routeResolver: async () => { throw new Error("idempotent reuse should not call Routes"); },
    });
    expect(second.optionIds).toEqual(first.optionIds);
    expect(second.reusedExistingOptions).toBe(true);
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).size)
      .toBe(optionCountBeforeReplay);
    expect((await getFirestore().collection(`trips/${trip.tripId}/validationSnapshots`).get()).size)
      .toBe(validationCountBeforeReplay);
  }, 60_000);

  it("leaves solo in PLANNING and persists no option when detailed provider data is unavailable", async () => {
    const trip = await createSoloTrip("Provider failure");
    await submit(trip.tripId, "provider-failure");
    const providers = providerResolvers();
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      routeResolver: providers.routeResolver,
      placeDetailsResolver: async () => { throw new Error("Places unavailable"); },
    }));
    expect(reason).toBe("EXTERNAL_DATA_UNAVAILABLE");
    expect((await getFirestore().doc(`trips/${trip.tripId}`).get()).data()?.phase).toBe("PLANNING");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 60_000);

  it("rejects stale membership authority during long-running Planning and commits no options", async () => {
    const trip = await createSoloTrip("Stale membership");
    await submit(trip.tripId, "stale-membership");
    const providers = providerResolvers({
      onFirstPlaceDetails: async () => {
        const db = getFirestore();
        const batch = db.batch();
        batch.set(db.doc(`trips/${trip.tripId}/members/member`), {
          uid: "member",
          role: "MEMBER",
          status: "ACTIVE",
          joinedAt: Timestamp.now(),
        });
        batch.update(db.doc(`trips/${trip.tripId}`), {
          activeMemberCount: 2,
          membershipVersion: 2,
        });
        await batch.commit();
      },
    });
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      ...providers,
    }));
    expect(reason).toBe("STALE_MEMBERSHIP_VERSION");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 60_000);

  it("rejects a planningCycle change after authority capture and commits no options", async () => {
    const trip = await createSoloTrip("Stale cycle");
    await submit(trip.tripId, "stale-cycle");
    const providers = providerResolvers({
      onFirstPlaceDetails: async () => {
        await getFirestore().doc(`trips/${trip.tripId}`).update({ planningCycle: 2 });
      },
    });
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      ...providers,
    }));
    expect(reason).toBe("STALE_PLANNING_CYCLE");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 60_000);

  it("rejects a phase change after authority capture and commits no options", async () => {
    const trip = await createSoloTrip("Stale phase");
    await submit(trip.tripId, "stale-phase");
    const providers = providerResolvers({
      onFirstPlaceDetails: async () => {
        await getFirestore().doc(`trips/${trip.tripId}`).update({ phase: "REVIEW" });
      },
    });
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      ...providers,
    }));
    expect(reason).toBe("INVALID_PHASE");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 60_000);

  it("rejects an OWNER authority change after authority capture and commits no options", async () => {
    const trip = await createSoloTrip("Stale owner");
    await submit(trip.tripId, "stale-owner");
    const providers = providerResolvers({
      onFirstPlaceDetails: async () => {
        await getFirestore().doc(`trips/${trip.tripId}`).update({ ownerId: "other-owner" });
      },
    });
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      ...providers,
    }));
    expect(reason).toBe("OWNER_REQUIRED");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 60_000);

  it("rejects a candidate activation epoch change after authority capture and commits no options", async () => {
    const trip = await createSoloTrip("Stale candidate");
    const submitted = await submit(trip.tripId, "stale-candidate");
    const providers = providerResolvers({
      onFirstPlaceDetails: async () => {
        await getFirestore().doc(`trips/${trip.tripId}/candidates/${submitted.candidateId}`).update({
          activationVersion: 2,
        });
      },
    });
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "owner",
      expectedPlanningCycle: 1,
      ...providers,
    }));
    expect(reason).toBe("CONFLICT");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 60_000);

  it("enforces OWNER authority before expensive Planning work", async () => {
    const trip = await createSoloTrip("Owner guard");
    await submit(trip.tripId, "owner-guard");
    const reason = await reasonOf(() => runAuthoritativePlanning({
      tripId: trip.tripId,
      ownerId: "not-owner",
      expectedPlanningCycle: 1,
      ...providerResolvers(),
    }));
    expect(reason).toBe("NOT_MEMBER");
    expect((await getFirestore().collection(`trips/${trip.tripId}/itineraryOptions`).get()).empty).toBe(true);
  }, 30_000);
});
