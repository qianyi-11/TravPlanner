import { describe, expect, it, vi } from "vitest";
import type { StoredExternalSnapshot } from "../../functions/src/integrations/externalSnapshots";
import {
  calculateShortlist,
  calculateShortlistCapacity,
  calculateTotalUsableMinutes,
  deterministicMedian,
  rankGroupOrdinaryCandidates,
  rankSoloOrdinaryCandidates,
  representativeTravelSample,
  resolveRepresentativeTravel,
  schedulingCriticalFactCompleteness,
  shortlistStatusPatches,
  unionOccupiedMinutesWithinWindow,
} from "../../functions/src/shortlist";
import { resolveCandidateExpectedDuration } from "../../functions/src/validation/resolveCandidateExpectedDuration";

const aggregate = (scoreTotal: number, extra = {}) => ({ scoreTotal, responseCount: 0, wantCount: 0, neutralCount: 0, avoidCount: 0, ...extra });

describe("Shortlist deterministic domain", () => {
  it("ranks group ordinary candidates by scoreTotal then candidateId only", () => {
    const input = [
      { candidateId: "c", mustDo: false, voteAggregate: aggregate(0, { wantCount: 9 }) },
      { candidateId: "b", mustDo: false, voteAggregate: aggregate(2, { avoidCount: 9 }) },
      { candidateId: "a", mustDo: false, voteAggregate: aggregate(2, { responseCount: 99 }) },
      { candidateId: "must", mustDo: true, voteAggregate: aggregate(-5) },
    ];
    expect(rankGroupOrdinaryCandidates(input).map(x => x.candidateId)).toEqual(["a", "b", "c"]);
    expect(rankGroupOrdinaryCandidates([...input].reverse()).map(x => x.candidateId)).toEqual(["a", "b", "c"]);
  });

  it("always includes MUST_DO and applies the non-MUST_DO cap separately", () => {
    const candidates = [
      ...Array.from({ length: 16 }, (_, i) => ({ candidateId: `m${String(i).padStart(2, "0")}`, mustDo: true, voteAggregate: aggregate(-1) })),
      ...Array.from({ length: 20 }, (_, i) => ({ candidateId: `o${String(i).padStart(2, "0")}`, mustDo: false, voteAggregate: aggregate(20 - i) })),
    ];
    const result = calculateShortlist({ mode: "GROUP", candidates, totalUsableMinutes: 600 });
    expect(result.mustDoCandidateIds).toHaveLength(16);
    expect(result.capacity.usedZeroTravelFallback).toBe(true);
    expect(result.ordinaryRankedCandidateIds).toHaveLength(20);
    expect(result.orderedSelectedCandidateIds).toHaveLength(31);
  });

  it("computes odd/even medians and does not floor estimated slots before 1.5x", () => {
    expect(deterministicMedian([30, 60, 90])).toBe(60);
    expect(deterministicMedian([30, 61])).toBe(46);
    const result = calculateShortlistCapacity({ totalUsableMinutes: 100, expectedDurations: [60], representativeTravelMinutes: [20], mustDoCount: 0 });
    expect(result.estimatedSlots).toBe(1.25);
    expect(result.detailedValidationTarget).toBe(2);
    expect(result.ordinaryCapacity).toBe(2);
  });

  it("subtracts the union of confirmed booking occupancy without double-counting", () => {
    expect(unionOccupiedMinutesWithinWindow({
      date: "2026-09-01", windowStartMinute: 540, windowEndMinute: 720,
      bookings: [
        { date: "2026-09-01", startMinute: 480, endMinute: 600 },
        { date: "2026-09-01", startMinute: 570, endMinute: 660 },
        { date: "2026-09-01", startMinute: 600, endMinute: 630 },
        { date: "2026-09-01", startMinute: 660, endMinute: 720 },
      ],
    })).toBe(180);
    expect(calculateTotalUsableMinutes({
      setup: {
        startDate: "2026-09-01", endDate: "2026-09-02",
        defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
        dayOverrides: [{ date: "2026-09-02", startTime: "10:00", endTime: "16:00" }],
      },
      confirmedBookings: [{ date: "2026-09-01", startMinute: 600, endMinute: 660 }],
    })).toBe(540 - 60 + 360);
  });

  it("uses the approved zero-travel fallback and never fabricates missing duration", () => {
    expect(calculateShortlistCapacity({ totalUsableMinutes: 1000, expectedDurations: [], representativeTravelMinutes: [], mustDoCount: 4 })).toMatchObject({ ordinaryCapacity: 15, usedZeroTravelFallback: true });
    expect(calculateShortlistCapacity({ totalUsableMinutes: 1000, expectedDurations: [], representativeTravelMinutes: [30], mustDoCount: 0 })).toMatchObject({ ordinaryCapacity: 0, missingDurationMedian: true });
  });

  it("reuses authoritative expected-duration precedence and upward-rounded median", () => {
    const submissions = [
      { candidateId: "c", memberId: "a", preference: "INTERESTED" as const, preferredPeriod: "ANYTIME" as const, estimatedDurationMinutes: 30, durationSource: "USER_OVERRIDE" as const, createdAt: {}, updatedAt: {} },
      { candidateId: "c", memberId: "b", preference: "INTERESTED" as const, preferredPeriod: "ANYTIME" as const, estimatedDurationMinutes: 61, durationSource: "USER_OVERRIDE" as const, createdAt: {}, updatedAt: {} },
    ];
    expect(resolveCandidateExpectedDuration({ confirmedDurationFacts: [], submissions, activeMemberIds: ["a", "b"] })).toEqual({ kind: "SUBMISSION_MEDIAN", durationMinutes: 46 });
    expect(resolveCandidateExpectedDuration({ confirmedDurationFacts: [{ durationMinutes: 75, confirmedAt: 2, externalSnapshotId: "s" }], submissions, activeMemberIds: ["a", "b"] })).toEqual({ kind: "USER_CONFIRMED", durationMinutes: 75, externalSnapshotId: "s" });
  });

  it("samples lower-middle trip date, effective-window midpoint, 15-minute bucket, primary transport, and both directions", async () => {
    const trip = {
      startDate: "2026-09-01", endDate: "2026-09-04",
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      dayOverrides: [{ date: "2026-09-02", startTime: "10:07", endTime: "16:08" }],
      baseLocation: { source: "USER_CONFIRMED" as const, name: "Base", lat: 3, lng: 101 },
      primaryTransport: "TRANSIT" as const, timezone: "Asia/Kuala_Lumpur",
    };
    expect(representativeTravelSample(trip)).toEqual({ date: "2026-09-02", minute: 787, departureBucketStartMinute: 780 });
    const route = vi.fn(async input => ({
      id: input.origin.lat === 3 ? "out" : "back",
      snapshot: {
        provider: "GOOGLE_ROUTES", kind: "ROUTE", cacheKey: "k", source: "test", fetchedAt: new Date(), freshness: "FRESH",
        data: { origin: input.origin, destination: input.destination, transportMode: input.transportMode, departureBucket: { date: input.departureDate, startMinute: 780 }, durationMinutes: input.origin.lat === 3 ? 31 : 40 },
      },
    } as StoredExternalSnapshot));
    const resolved = await resolveRepresentativeTravel({ tripId: "t", trip, candidateLocation: { lat: 4, lng: 102 }, routeResolver: route });
    expect(resolved.representativeTravelMinutes).toBe(36);
    expect(resolved.externalSnapshotIds).toEqual(["back", "out"]);
    expect(route).toHaveBeenCalledTimes(2);
    expect(route.mock.calls.every(([call]) => call.transportMode === "TRANSIT" && call.departureDate === "2026-09-02" && call.departureMinute === 787)).toBe(true);
  });

  it("fails travel soft when either direction is unavailable", async () => {
    let call = 0;
    const route = vi.fn(async input => {
      call += 1;
      if (call === 2) throw new Error("provider");
      return { id: "one", snapshot: { provider: "GOOGLE_ROUTES", kind: "ROUTE", cacheKey: "k", source: "test", fetchedAt: new Date(), freshness: "FRESH", data: { origin: input.origin, destination: input.destination, transportMode: input.transportMode, departureBucket: { date: input.departureDate, startMinute: 540 }, durationMinutes: 20 } } } as StoredExternalSnapshot;
    });
    const resolved = await resolveRepresentativeTravel({
      tripId: "t", candidateLocation: { lat: 4, lng: 102 }, routeResolver: route,
      trip: { startDate: "2026-09-01", endDate: "2026-09-01", defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, dayOverrides: [], baseLocation: { source: "USER_CONFIRMED", name: "Base", lat: 3, lng: 101 }, primaryTransport: "WALKING", timezone: "Asia/Kuala_Lumpur" },
    });
    expect(resolved.representativeTravelMinutes).toBeUndefined();
    expect(resolved.externalSnapshotIds).toEqual([]);
  });

  it("ranks solo MUST_DO first then completeness, known/lower travel, candidateId", () => {
    const ordinary = rankSoloOrdinaryCandidates([
      { candidateId: "d", mustDo: false, factCompleteness: "INCOMPLETE", representativeTravelMinutes: 5 },
      { candidateId: "c", mustDo: false, factCompleteness: "COMPLETE" },
      { candidateId: "b", mustDo: false, factCompleteness: "COMPLETE", representativeTravelMinutes: 20 },
      { candidateId: "a", mustDo: false, factCompleteness: "COMPLETE", representativeTravelMinutes: 20 },
    ]);
    expect(ordinary.map(x => x.candidateId)).toEqual(["a", "b", "c", "d"]);
    expect(schedulingCriticalFactCompleteness({ hasCanonicalIdentityAndLocation: true, hasExpectedDuration: true, hasApplicableVisitWindowAuthority: false })).toBe("INCOMPLETE");
  });

  it("persists only shortlist selection semantics, not validation semantics", () => {
    const result = calculateShortlist({ mode: "GROUP", totalUsableMinutes: 100, candidates: [
      { candidateId: "a", mustDo: false, expectedDurationMinutes: 60, representativeTravelMinutes: 20, voteAggregate: aggregate(2) },
      { candidateId: "b", mustDo: false, expectedDurationMinutes: 60, representativeTravelMinutes: 20, voteAggregate: aggregate(1) },
      { candidateId: "c", mustDo: false, expectedDurationMinutes: 60, representativeTravelMinutes: 20, voteAggregate: aggregate(0) },
    ] });
    expect(shortlistStatusPatches(result)).toEqual([
      { candidateId: "a", shortlistStatus: "SHORTLISTED" },
      { candidateId: "b", shortlistStatus: "SHORTLISTED" },
      { candidateId: "c", shortlistStatus: "NOT_SHORTLISTED" },
    ]);
  });
});
