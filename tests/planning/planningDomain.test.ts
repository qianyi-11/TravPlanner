import { describe, expect, it } from "vitest";
import type { StoredExternalSnapshot } from "../../functions/src/integrations/externalSnapshots";
import {
  itineraryDaysIdentity,
  planningSafetyBufferMinutes,
  proposePlanningOption,
} from "../../functions/src/planning/schedule";
import { planningVariantOrders } from "../../functions/src/planning/variants";
import type {
  LockedPlanningBooking,
  PlanningCandidate,
  PlanningTripContext,
} from "../../functions/src/planning/types";
import { evaluateTravelLegFeasibility } from "../../functions/src/validation/travelFeasibility";

const trip: PlanningTripContext = {
  startDate: "2026-10-01",
  endDate: "2026-10-01",
  timezone: "Asia/Kuala_Lumpur",
  baseLocation: { name: "Base", lat: 3.1, lng: 101.6, source: "USER_CONFIRMED" },
  defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
  dayOverrides: [],
  primaryTransport: "DRIVING",
};

function candidate(input: Partial<PlanningCandidate> & Pick<PlanningCandidate, "candidateId">): PlanningCandidate {
  return {
    candidateId: input.candidateId,
    title: input.title ?? input.candidateId,
    location: input.location ?? { name: input.candidateId, lat: 3.2, lng: 101.7 },
    durationMinutes: input.durationMinutes ?? 60,
    mustDo: input.mustDo ?? false,
    priorityIndex: input.priorityIndex ?? 0,
    votePreference: input.votePreference ?? 0,
    authoritativeVisitWindows: input.authoritativeVisitWindows ?? [{
      date: "2026-10-01",
      startMinute: 9 * 60,
      endMinute: 18 * 60,
    }],
    ...(input.knownPrice === undefined ? {} : { knownPrice: input.knownPrice }),
  };
}

function routeSnapshot(input: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  transportMode: "WALKING" | "DRIVING" | "TRANSIT";
  departureDate: string;
  departureMinute: number;
  durationMinutes?: number;
}): StoredExternalSnapshot {
  return {
    id: `route-${input.departureDate}-${input.departureMinute}-${input.origin.lat}-${input.destination.lat}`,
    snapshot: {
      kind: "ROUTE",
      provider: "GOOGLE_ROUTES",
      source: "GOOGLE_ROUTES_API_V2",
      cacheKey: "test-route",
      freshness: "FRESH",
      fetchedAt: {},
      expiresAt: {},
      data: {
        origin: input.origin,
        destination: input.destination,
        transportMode: input.transportMode,
        departureBucket: {
          date: input.departureDate,
          startMinute: Math.floor(input.departureMinute / 15) * 15,
        },
        durationMinutes: input.durationMinutes ?? 10,
      },
    },
  } as StoredExternalSnapshot;
}

const routeResolver = async (input: Parameters<NonNullable<Parameters<typeof proposePlanningOption>[0]["routeResolver"]>>[0]) =>
  routeSnapshot(input);

describe("Planning deterministic domain", () => {
  it("uses the approved deterministic travel safety buffers", () => {
    expect(planningSafetyBufferMinutes("WALKING")).toBe(10);
    expect(planningSafetyBufferMinutes("DRIVING")).toBe(10);
    expect(planningSafetyBufferMinutes("TRANSIT")).toBe(15);
  });

  it("keeps MUST_DO protected and produces deterministic variant orderings", () => {
    const candidates = [
      candidate({ candidateId: "priority", priorityIndex: 0, location: { name: "Far", lat: 10, lng: 110 } }),
      candidate({ candidateId: "near", priorityIndex: 1, location: { name: "Near", lat: 3.11, lng: 101.61 } }),
      candidate({ candidateId: "must", priorityIndex: 2, mustDo: true, location: { name: "Must", lat: 20, lng: 120 } }),
    ];
    const orders = planningVariantOrders({ candidates, base: trip.baseLocation });
    expect(orders.map(entry => entry.variant)).toEqual([
      "BALANCED",
      "LESS_TRAVEL",
      "MORE_HIGH_PRIORITY",
    ]);
    for (const order of orders) expect(order.candidates[0].candidateId).toBe("must");
    expect(orders.find(entry => entry.variant === "LESS_TRAVEL")?.candidates.map(item => item.candidateId))
      .toEqual(["must", "near", "priority"]);
    expect(orders.find(entry => entry.variant === "MORE_HIGH_PRIORITY")?.candidates.map(item => item.candidateId))
      .toEqual(["must", "priority", "near"]);
  });

  it("locks confirmed bookings and passes the concrete route gap to Validator without double-counting the buffer", async () => {
    const activity = candidate({ candidateId: "activity", mustDo: true });
    const fixed: LockedPlanningBooking[] = [{
      bookingId: "booking-1",
      candidateId: "fixed",
      title: "Fixed",
      location: { name: "Fixed", lat: 3.25, lng: 101.75 },
      date: "2026-10-01",
      startMinute: 12 * 60,
      endMinute: 13 * 60,
    }];
    const option = await proposePlanningOption({
      tripId: "trip-1",
      trip,
      variant: "BALANCED",
      orderedCandidates: [activity],
      allShortlistedCandidates: [activity],
      fixedBookings: fixed,
      routeResolver,
    });
    expect(option.unsatisfiedMustDoCandidateIds).toEqual([]);
    expect(option.candidatePlacements).toHaveLength(1);
    expect(option.days[0].items.some(item => item.itemId === "fixed:booking-1")).toBe(true);
    expect(option.days[0].items.some(item => item.itemId === "candidate:activity")).toBe(true);
    expect(option.routeLegs.length).toBeGreaterThan(0);
    expect(option.routeLegs.every(leg => leg.availableMinutes >= 0)).toBe(true);

    const inboundLeg = option.routeLegs[0];
    expect(inboundLeg.availableMinutes).toBe(20);
    const routeData = inboundLeg.snapshot.snapshot.data;
    expect(routeData).toBeDefined();
    if (!routeData) throw new Error("Expected normalized route data");
    expect(evaluateTravelLegFeasibility({
      route: routeData,
      availableMinutes: inboundLeg.availableMinutes,
    })).toMatchObject({
      routeDurationMinutes: 10,
      safetyBufferMinutes: 10,
      requiredMinutes: 20,
      availableMinutes: 20,
      feasible: true,
    });
    expect(option.score.preferredPeriod).toBe(0);
  });

  it("rejects a placement when route duration plus safety buffer cannot fit the authoritative visit window", async () => {
    const protectedCandidate = candidate({
      candidateId: "route-tight",
      mustDo: true,
      durationMinutes: 1,
      authoritativeVisitWindows: [{
        date: "2026-10-01",
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 20,
      }],
    });
    const option = await proposePlanningOption({
      tripId: "trip-1",
      trip,
      variant: "BALANCED",
      orderedCandidates: [protectedCandidate],
      allShortlistedCandidates: [protectedCandidate],
      fixedBookings: [],
      routeResolver,
    });
    expect(option.candidatePlacements).toEqual([]);
    expect(option.unsatisfiedMustDoCandidateIds).toEqual(["route-tight"]);
  });

  it("never silently drops an unplaceable MUST_DO candidate", async () => {
    const protectedCandidate = candidate({
      candidateId: "must",
      mustDo: true,
      durationMinutes: 60,
      authoritativeVisitWindows: [{
        date: "2026-10-01",
        startMinute: 12 * 60,
        endMinute: 12 * 60 + 30,
      }],
    });
    const option = await proposePlanningOption({
      tripId: "trip-1",
      trip,
      variant: "MORE_HIGH_PRIORITY",
      orderedCandidates: [protectedCandidate],
      allShortlistedCandidates: [protectedCandidate],
      fixedBookings: [],
      routeResolver,
    });
    expect(option.candidatePlacements).toEqual([]);
    expect(option.unsatisfiedMustDoCandidateIds).toEqual(["must"]);
  });

  it("deduplicates schedules by concrete cycle-bound itinerary identity", async () => {
    const activity = candidate({ candidateId: "activity" });
    const left = await proposePlanningOption({
      tripId: "trip-1",
      trip,
      variant: "BALANCED",
      orderedCandidates: [activity],
      allShortlistedCandidates: [activity],
      fixedBookings: [],
      routeResolver,
    });
    const right = await proposePlanningOption({
      tripId: "trip-1",
      trip,
      variant: "MORE_HIGH_PRIORITY",
      orderedCandidates: [activity],
      allShortlistedCandidates: [activity],
      fixedBookings: [],
      routeResolver,
    });
    expect(itineraryDaysIdentity(left.days)).toBe(itineraryDaysIdentity(right.days));
  });
});
