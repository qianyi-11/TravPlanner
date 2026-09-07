import { describe, expect, it } from "vitest";
import type {
  CandidateDocument,
  SubmissionDocument,
  TripDocument,
} from "@travel-planner/shared";
import { candidateIdFromPlaceId } from "../../functions/src/candidates/candidateIdentity";
import {
  buildCriticalFactScopeKey,
  buildPlaceDetailsCacheKey,
  compareProposalRecency,
  resolveCandidateExpectedDuration,
  createSameDayInterval,
  evaluateCandidateValidation,
  evaluateItineraryValidation,
} from "../../functions/src/validation";
import type { StoredExternalSnapshot } from "../../functions/src/integrations/externalSnapshots";
import { buildRouteCacheKey } from "../../functions/src/integrations/routeCacheKey";

const timestamp = { toMillis: () => 1_000 };

function trip(): TripDocument {
  return {
    name: "Phase 3",
    ownerId: "owner",
    phase: "PLANNING",
    planningCycle: 2,
    membershipVersion: 3,
    destination: { placeId: "destination", name: "Destination", lat: 3.1, lng: 101.6 },
    startDate: "2026-10-05",
    endDate: "2026-10-06",
    timezone: "Asia/Kuala_Lumpur",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 3.1, lng: 101.6 },
    defaultDayWindow: { startTime: "09:00", endTime: "20:00" },
    dayOverrides: [],
    primaryTransport: "WALKING",
    activityBudgetCurrency: "MYR",
    activeMemberCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function candidate(placeId = "candidate-place"): CandidateDocument {
  return {
    placeId,
    name: "Candidate",
    location: { lat: 3.2, lng: 101.7 },
    placeTypes: ["tourist_attraction"],
    environment: "UNKNOWN",
    active: true,
    activationVersion: 1,
    shortlistStatus: "SHORTLISTED",
    firstSubmittedBy: "owner",
    firstSubmittedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function submission(memberId: string, minutes: number): SubmissionDocument {
  return {
    candidateId: candidateIdFromPlaceId("candidate-place"),
    memberId,
    preference: "INTERESTED",
    preferredPeriod: "ANYTIME",
    estimatedDurationMinutes: minutes,
    durationSource: "USER_OVERRIDE",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function placeDetailsSnapshot(): StoredExternalSnapshot {
  return {
    id: "place-snapshot",
    snapshot: {
      provider: "GOOGLE_PLACES",
      kind: "PLACE_DETAILS",
      cacheKey: buildPlaceDetailsCacheKey({
        placeId: "candidate-place",
        timezone: "Asia/Kuala_Lumpur",
        startDate: "2026-10-05",
        endDate: "2026-10-06",
      }),
      source: "GOOGLE_PLACES_API_NEW",
      fetchedAt: timestamp,
      freshness: "FRESH",
      data: {
        placeId: "candidate-place",
        location: { lat: 3.2, lng: 101.7 },
        placeTypes: ["tourist_attraction"],
        visitWindows: [
          { date: "2026-10-05", startMinute: 540, endMinute: 1200 },
          { date: "2026-10-06", startMinute: 540, endMinute: 1200 },
        ],
      },
    },
  };
}

function routeSnapshot(durationMinutes: number): StoredExternalSnapshot {
  const data = {
    origin: { lat: 3.1, lng: 101.6 },
    destination: { lat: 3.2, lng: 101.7 },
    transportMode: "WALKING" as const,
    departureBucket: { date: "2026-10-05", startMinute: 585 },
    durationMinutes,
  };
  return {
    id: `route-${durationMinutes}`,
    snapshot: {
      provider: "GOOGLE_ROUTES",
      kind: "ROUTE",
      cacheKey: buildRouteCacheKey(data),
      source: "GOOGLE_ROUTES_API_V2",
      fetchedAt: timestamp,
      freshness: "FRESH",
      data,
    },
  };
}

describe("Validation Phase 3 locked decisions", () => {
  it("uses latest confirmed duration before current-ACTIVE submission median", () => {
    const resolved = resolveCandidateExpectedDuration({
      confirmedDurationFacts: [
        { durationMinutes: 80, confirmedAt: { toMillis: () => 100 }, externalSnapshotId: "a" },
        { durationMinutes: 95, confirmedAt: { toMillis: () => 200 }, externalSnapshotId: "b" },
      ],
      submissions: [submission("owner", 60), submission("member", 121), submission("removed", 999)],
      activeMemberIds: ["owner", "member"],
    });
    expect(resolved).toEqual({
      kind: "USER_CONFIRMED",
      durationMinutes: 95,
      externalSnapshotId: "b",
    });
  });

  it("uses ceil even median from ACTIVE members only", () => {
    expect(resolveCandidateExpectedDuration({
      confirmedDurationFacts: [],
      submissions: [submission("owner", 60), submission("member", 121), submission("removed", 1)],
      activeMemberIds: ["owner", "member"],
    })).toEqual({ kind: "SUBMISSION_MEDIAN", durationMinutes: 91 });
  });

  it("locks semantic scope context without planningCycle TTL", () => {
    const visitA = buildCriticalFactScopeKey({
      candidateId: "c",
      timezone: "Asia/Kuching",
      fact: { type: "VISIT_WINDOW", date: "2026-10-05", startTime: "09:00", endTime: "10:00" },
    });
    const visitB = buildCriticalFactScopeKey({
      candidateId: "c",
      timezone: "Asia/Tokyo",
      fact: { type: "VISIT_WINDOW", date: "2026-10-05", startTime: "09:00", endTime: "10:00" },
    });
    const priceMyr = buildCriticalFactScopeKey({
      candidateId: "c",
      timezone: "Asia/Kuching",
      fact: { type: "PRICE", amount: 10, costStatus: "ESTIMATED", currency: "MYR" },
    });
    const priceSgd = buildCriticalFactScopeKey({
      candidateId: "c",
      timezone: "Asia/Kuching",
      fact: { type: "PRICE", amount: 10, costStatus: "ESTIMATED", currency: "SGD" },
    });
    expect(visitA).not.toBe(visitB);
    expect(priceMyr).not.toBe(priceSgd);
    expect(visitA).not.toContain("planningCycle");
  });

  it("uses proposal id as deterministic tie-break only when createdAt ties", () => {
    expect(compareProposalRecency(
      { proposalId: "b", createdAt: { toMillis: () => 100 } },
      { proposalId: "a", createdAt: { toMillis: () => 100 } },
    )).toBeGreaterThan(0);
  });

  it("does not invent route topology for intrinsic candidate validation", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const output = evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: placeDetailsSnapshot(),
    });
    expect(output.evaluation.hardChecks.find(check => check.check === "ROUTE_TIME")).toEqual({
      check: "ROUTE_TIME",
      status: "NOT_APPLICABLE",
    });
    expect(output.evaluation.reasonCodes).not.toContain("INSUFFICIENT_TRAVEL_TIME");
  });

  it("fails travel only when a supplied route exceeds a concrete gap", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const interval = createSameDayInterval("2026-10-05", 600, 660);
    const candidateValidation = evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: placeDetailsSnapshot(),
      placement: { interval, confirmedBookingIntervals: [] },
    });

    const exact = evaluateItineraryValidation({
      candidateValidations: [candidateValidation],
      activityIntervals: [interval],
      routeLegs: [{ snapshot: routeSnapshot(20), availableMinutes: 30 }],
      routeSetComplete: true,
      currency: "MYR",
    });
    expect(exact.evaluation.hardChecks.find(check => check.check === "ROUTE_TIME")?.status).toBe("PASS");

    const short = evaluateItineraryValidation({
      candidateValidations: [candidateValidation],
      activityIntervals: [interval],
      routeLegs: [{ snapshot: routeSnapshot(20), availableMinutes: 29 }],
      routeSetComplete: true,
      currency: "MYR",
    });
    expect(short.evaluation.hardChecks.find(check => check.check === "ROUTE_TIME")).toEqual({
      check: "ROUTE_TIME",
      status: "FAIL",
      reasonCode: "INSUFFICIENT_TRAVEL_TIME",
    });
    expect(short.evaluation.result).toBe("INVALID");
  });

  it("requires a concrete placement interval to match authoritative expected duration", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);

    expect(() => evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 120)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: placeDetailsSnapshot(),
      placement: { interval: createSameDayInterval("2026-10-05", 600, 660), confirmedBookingIntervals: [] },
    })).toThrow(/does not match authoritative expected duration/i);

    expect(() => evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 120)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: placeDetailsSnapshot(),
      placement: { interval: createSameDayInterval("2026-10-05", 600, 720), confirmedBookingIntervals: [] },
    })).not.toThrow();
  });

  it("does not treat a manual visit window on another date as a hard closure", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const visitSnapshot: StoredExternalSnapshot = {
      id: "manual-visit",
      snapshot: {
        provider: "USER_CONFIRMED",
        kind: "CRITICAL_FACT",
        cacheKey: buildCriticalFactScopeKey({
          candidateId,
          timezone: "Asia/Kuala_Lumpur",
          fact: { type: "VISIT_WINDOW", date: "2026-10-05", startTime: "09:00", endTime: "18:00" },
        }),
        source: "USER_CONFIRMED",
        fetchedAt: timestamp,
        freshness: "FRESH",
        submittedBy: "member",
        confirmedBy: "owner",
        confirmedAt: timestamp,
        data: { type: "VISIT_WINDOW", date: "2026-10-05", startTime: "09:00", endTime: "18:00" },
      },
    };

    const output = evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [visitSnapshot],
      placement: { interval: createSameDayInterval("2026-10-06", 600, 660), confirmedBookingIntervals: [] },
    });
    expect(output.evaluation.hardChecks.find(check => check.check === "VISIT_WINDOW")).toEqual({
      check: "VISIT_WINDOW",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "MISSING_VISIT_WINDOW",
    });
  });

  it("treats a missing day as closed only when a fresh provider schedule establishes other trip-day windows", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const providerOnlyFirstDay = placeDetailsSnapshot();
    if (providerOnlyFirstDay.snapshot.kind !== "PLACE_DETAILS" || !providerOnlyFirstDay.snapshot.data) {
      throw new Error("test fixture must be PLACE_DETAILS");
    }
    providerOnlyFirstDay.snapshot.data.visitWindows = [
      { date: "2026-10-05", startMinute: 540, endMinute: 1200 },
    ];

    const output = evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: providerOnlyFirstDay,
      placement: { interval: createSameDayInterval("2026-10-06", 600, 660), confirmedBookingIntervals: [] },
    });
    expect(output.evaluation.hardChecks.find(check => check.check === "VISIT_WINDOW")).toEqual({
      check: "VISIT_WINDOW",
      status: "FAIL",
      reasonCode: "INVALID_VISIT_WINDOW",
    });
  });

  it("keeps empty fresh provider opening data unresolved rather than inventing a closure", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const emptyProvider = placeDetailsSnapshot();
    if (emptyProvider.snapshot.kind !== "PLACE_DETAILS" || !emptyProvider.snapshot.data) {
      throw new Error("test fixture must be PLACE_DETAILS");
    }
    emptyProvider.snapshot.data.visitWindows = [];

    const output = evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: emptyProvider,
      placement: { interval: createSameDayInterval("2026-10-06", 600, 660), confirmedBookingIntervals: [] },
    });
    expect(output.evaluation.hardChecks.find(check => check.check === "VISIT_WINDOW")).toEqual({
      check: "VISIT_WINDOW",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "MISSING_VISIT_WINDOW",
    });
  });


  it("rejects itinerary composition when candidate validation belongs to a different interval", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const validatedInterval = createSameDayInterval("2026-10-05", 600, 660);
    const candidateValidation = evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: placeDetailsSnapshot(),
      placement: { interval: validatedInterval, confirmedBookingIntervals: [] },
    });

    expect(() => evaluateItineraryValidation({
      candidateValidations: [candidateValidation],
      activityIntervals: [createSameDayInterval("2026-10-05", 660, 720)],
      routeLegs: [],
      routeSetComplete: true,
      currency: "MYR",
    })).toThrow(/not bound to the supplied activity interval/i);
  });

  it("rejects route facts that use a transport mode other than trip.primaryTransport", () => {
    const candidateDoc = candidate();
    const candidateId = candidateIdFromPlaceId(candidateDoc.placeId);
    const interval = createSameDayInterval("2026-10-05", 600, 660);
    const wrongMode = routeSnapshot(20);
    if (wrongMode.snapshot.kind !== "ROUTE" || !wrongMode.snapshot.data) throw new Error("route fixture");
    wrongMode.snapshot.data.transportMode = "DRIVING";
    wrongMode.snapshot.cacheKey = buildRouteCacheKey(wrongMode.snapshot.data);

    expect(() => evaluateCandidateValidation({
      candidateId,
      candidate: candidateDoc,
      trip: trip(),
      submissions: [submission("owner", 60)],
      activeMemberIds: ["owner"],
      criticalFactSnapshots: [],
      placeDetailsSnapshot: placeDetailsSnapshot(),
      placement: {
        interval,
        confirmedBookingIntervals: [],
        route: { snapshot: wrongMode, availableMinutes: 30 },
      },
    })).toThrow(/primaryTransport/i);
  });

});
