import {
  candidateDocumentSchema,
  submissionDocumentSchema,
  type CandidateDocument,
  type NormalizedVisitWindow,
  type SubmissionDocument,
  type TransportMode,
  type TripDocument,
  type ValidationHardCheck,
} from "@travel-planner/shared";
import type { StoredExternalSnapshot } from "../integrations/externalSnapshots";
import { buildRouteCacheKey } from "../integrations/routeCacheKey";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";
import { evaluateActivityBudgetCheck, evaluatePriceCheck } from "./activityBudgetFeasibility";
import { evaluateDayWindowCheck, evaluateTripDateCheck } from "./dayWindow";
import { evaluateFixedBookingConflictCheck } from "./fixedBookingConflict";
import { evaluateTravelTimeCheck } from "./travelFeasibility";
import { evaluateValidationResult } from "./evaluateValidationResult";
import { evaluateVisitWindowCheck, normalizeUserConfirmedVisitWindow } from "./visitWindow";
import type { SameDayInterval, ValidationEvaluation } from "./types";
import {
  buildCriticalFactScopeKey,
  buildPlaceDetailsCacheKey,
  timestampMillis,
} from "./criticalFactScope";
import {
  resolveCandidateExpectedDuration,
  type CandidateExpectedDurationResolution,
} from "./resolveCandidateExpectedDuration";

export interface CandidateRouteContext {
  snapshot: StoredExternalSnapshot;
  availableMinutes: number;
}

export interface CandidatePlacementContext {
  interval: SameDayInterval;
  /** Complete authoritative CONFIRMED fixed-booking interval set for this trip. */
  confirmedBookingIntervals: readonly SameDayInterval[];
  route?: CandidateRouteContext;
}

export interface CandidateValidationOutput {
  candidateId: string;
  planningCycle: number;
  activityBudgetCurrency: string;
  primaryTransport: TransportMode;
  placementInterval?: SameDayInterval;
  evaluation: ValidationEvaluation;
  expectedDuration: CandidateExpectedDurationResolution;
  externalSnapshotIds: string[];
  authoritativeVisitWindows: NormalizedVisitWindow[];
  knownPrice?: {
    amount: number;
    costStatus: "CONFIRMED" | "ESTIMATED";
    currency: string;
    externalSnapshotId: string;
  };
}

function latestByConfirmedAt(entries: readonly StoredExternalSnapshot[]) {
  return [...entries].sort((left, right) => {
    if (left.snapshot.kind !== "CRITICAL_FACT" || right.snapshot.kind !== "CRITICAL_FACT") return 0;
    const byTime = timestampMillis(right.snapshot.confirmedAt) - timestampMillis(left.snapshot.confirmedAt);
    return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
  })[0];
}

function activeUserConfirmedSnapshots(
  snapshots: readonly StoredExternalSnapshot[],
): StoredExternalSnapshot[] {
  return snapshots.filter(entry =>
    entry.snapshot.kind === "CRITICAL_FACT" &&
    entry.snapshot.provider === "USER_CONFIRMED" &&
    entry.snapshot.freshness === "FRESH",
  );
}

function resolveCriticalFacts(input: {
  candidateId: string;
  trip: TripDocument;
  snapshots: readonly StoredExternalSnapshot[];
}) {
  const confirmed = activeUserConfirmedSnapshots(input.snapshots);
  for (const entry of confirmed) {
    if (entry.snapshot.kind !== "CRITICAL_FACT") continue;
    const expectedScope = buildCriticalFactScopeKey({
      candidateId: input.candidateId,
      timezone: input.trip.timezone,
      fact: entry.snapshot.data,
    });
    if (entry.snapshot.cacheKey !== expectedScope) {
      throw new RangeError("USER_CONFIRMED snapshot semantic scope is inconsistent");
    }
  }
  const durationKey = buildCriticalFactScopeKey({
    candidateId: input.candidateId,
    timezone: input.trip.timezone,
    fact: { type: "DURATION", durationMinutes: 1 },
  });
  const priceKey = buildCriticalFactScopeKey({
    candidateId: input.candidateId,
    timezone: input.trip.timezone,
    fact: {
      type: "PRICE",
      amount: 0,
      costStatus: "ESTIMATED",
      currency: input.trip.activityBudgetCurrency,
    },
  });

  const durationSnapshots = confirmed.filter(entry =>
    entry.snapshot.kind === "CRITICAL_FACT" &&
    entry.snapshot.cacheKey === durationKey &&
    entry.snapshot.data.type === "DURATION",
  );
  const priceSnapshot = latestByConfirmedAt(confirmed.filter(entry =>
    entry.snapshot.kind === "CRITICAL_FACT" &&
    entry.snapshot.cacheKey === priceKey &&
    entry.snapshot.data.type === "PRICE" &&
    entry.snapshot.data.currency === input.trip.activityBudgetCurrency,
  ));

  const visitWindows: Array<{ window: NormalizedVisitWindow; snapshotId: string }> = [];
  for (const date of enumerateTripDates(input.trip.startDate, input.trip.endDate)) {
    const key = buildCriticalFactScopeKey({
      candidateId: input.candidateId,
      timezone: input.trip.timezone,
      fact: { type: "VISIT_WINDOW", date, startTime: "00:00", endTime: "00:01" },
    });
    const latest = latestByConfirmedAt(confirmed.filter(entry =>
      entry.snapshot.kind === "CRITICAL_FACT" &&
      entry.snapshot.cacheKey === key &&
      entry.snapshot.data.type === "VISIT_WINDOW",
    ));
    if (latest?.snapshot.kind === "CRITICAL_FACT" && latest.snapshot.data.type === "VISIT_WINDOW") {
      const normalized = normalizeUserConfirmedVisitWindow(latest.snapshot.data);
      if (normalized === null) throw new RangeError("Persisted USER_CONFIRMED visit window is invalid");
      visitWindows.push({ window: normalized, snapshotId: latest.id });
    }
  }

  return { durationSnapshots, priceSnapshot, visitWindows };
}

function enumerateTripDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || cursor > end) {
    throw new RangeError("Trip dates are invalid");
  }
  while (cursor <= end) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
    if (dates.length > 7) throw new RangeError("Trip date range exceeds MVP maximum");
  }
  return dates;
}

function visitWindowCheck(input: {
  placement?: CandidatePlacementContext;
  manualVisitWindows: readonly NormalizedVisitWindow[];
  providerVisitWindows: readonly NormalizedVisitWindow[];
  placeDetailsFreshness?: "FRESH" | "STALE" | "UNAVAILABLE";
}): ValidationHardCheck {
  if (input.placement) {
    const date = input.placement.interval.date;
    const manualSameDate = input.manualVisitWindows.filter(window => window.date === date);
    if (manualSameDate.length > 0) {
      return evaluateVisitWindowCheck({
        interval: input.placement.interval,
        visitWindows: manualSameDate,
        missingAuthoritativeVisitWindow: false,
      });
    }

    if (input.placeDetailsFreshness === "STALE") {
      return {
        check: "VISIT_WINDOW",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "EXTERNAL_DATA_STALE",
      };
    }
    if (input.placeDetailsFreshness === "UNAVAILABLE") {
      return {
        check: "VISIT_WINDOW",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "EXTERNAL_DATA_UNAVAILABLE",
      };
    }

    if (input.placeDetailsFreshness === "FRESH") {
      const providerSameDate = input.providerVisitWindows.filter(window => window.date === date);
      if (providerSameDate.length > 0) {
        return evaluateVisitWindowCheck({
          interval: input.placement.interval,
          visitWindows: providerSameDate,
          missingAuthoritativeVisitWindow: false,
        });
      }

      // A non-empty normalized provider schedule establishes that the place has
      // authoritative regular opening periods within the trip. If none apply
      // to this date, this placement is known to be outside the visit window.
      // An entirely empty provider schedule is ambiguous (for example opening
      // information may be unavailable), so keep that case unresolved.
      if (input.providerVisitWindows.length > 0) {
        return {
          check: "VISIT_WINDOW",
          status: "FAIL",
          reasonCode: "INVALID_VISIT_WINDOW",
        };
      }
    }

    return {
      check: "VISIT_WINDOW",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "MISSING_VISIT_WINDOW",
    };
  }

  if (input.manualVisitWindows.length > 0 || input.providerVisitWindows.length > 0) {
    return { check: "VISIT_WINDOW", status: "PASS" };
  }
  if (input.placeDetailsFreshness === "STALE") {
    return {
      check: "VISIT_WINDOW",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "EXTERNAL_DATA_STALE",
    };
  }
  if (input.placeDetailsFreshness === "UNAVAILABLE") {
    return {
      check: "VISIT_WINDOW",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "EXTERNAL_DATA_UNAVAILABLE",
    };
  }
  return {
    check: "VISIT_WINDOW",
    status: "NEEDS_CONFIRMATION",
    reasonCode: "MISSING_VISIT_WINDOW",
  };
}

export function evaluateCandidateValidation(input: {
  candidateId: string;
  candidate: CandidateDocument;
  trip: TripDocument;
  submissions: readonly SubmissionDocument[];
  activeMemberIds: ReadonlySet<string> | readonly string[];
  criticalFactSnapshots: readonly StoredExternalSnapshot[];
  placeDetailsSnapshot?: StoredExternalSnapshot;
  placement?: CandidatePlacementContext;
}): CandidateValidationOutput {
  const candidate = candidateDocumentSchema.parse(input.candidate);
  const submissions = input.submissions.map(submission => submissionDocumentSchema.parse(submission));
  if (submissions.some(submission => submission.candidateId !== input.candidateId)) {
    throw new RangeError("Candidate validation received a submission for another candidate");
  }
  const facts = resolveCriticalFacts({
    candidateId: input.candidateId,
    trip: input.trip,
    snapshots: input.criticalFactSnapshots,
  });

  const durationFacts = facts.durationSnapshots.flatMap(entry => {
    if (entry.snapshot.kind !== "CRITICAL_FACT" || entry.snapshot.data.type !== "DURATION") return [];
    return [{
      durationMinutes: entry.snapshot.data.durationMinutes,
      confirmedAt: entry.snapshot.confirmedAt,
      externalSnapshotId: entry.id,
    }];
  });
  const expectedDuration = resolveCandidateExpectedDuration({
    confirmedDurationFacts: durationFacts,
    submissions,
    activeMemberIds: input.activeMemberIds,
  });

  let knownPrice: CandidateValidationOutput["knownPrice"];
  if (facts.priceSnapshot?.snapshot.kind === "CRITICAL_FACT" && facts.priceSnapshot.snapshot.data.type === "PRICE") {
    const price = facts.priceSnapshot.snapshot.data;
    knownPrice = {
      amount: price.amount,
      costStatus: price.costStatus,
      currency: price.currency,
      externalSnapshotId: facts.priceSnapshot.id,
    };
  }

  const manualVisitWindows = facts.visitWindows.map(entry => entry.window);
  const manualVisitDates = new Set(manualVisitWindows.map(window => window.date));
  const providerVisitWindows: NormalizedVisitWindow[] = [];
  let placeDetailsFreshness: "FRESH" | "STALE" | "UNAVAILABLE" | undefined;
  if (input.placeDetailsSnapshot?.snapshot.kind === "PLACE_DETAILS") {
    const placeSnapshot = input.placeDetailsSnapshot.snapshot;
    const expectedPlaceCacheKey = buildPlaceDetailsCacheKey({
      placeId: candidate.placeId,
      timezone: input.trip.timezone,
      startDate: input.trip.startDate,
      endDate: input.trip.endDate,
    });
    if (placeSnapshot.cacheKey !== expectedPlaceCacheKey) {
      throw new RangeError("PLACE_DETAILS snapshot cache identity does not match candidate/trip authority");
    }
    const placeData = placeSnapshot.data;
    if (placeData !== undefined && placeData.placeId !== candidate.placeId) {
      throw new RangeError("PLACE_DETAILS snapshot identity does not match candidate authority");
    }
    placeDetailsFreshness = placeSnapshot.freshness;
    if (placeSnapshot.freshness === "FRESH" && placeData !== undefined) {
      providerVisitWindows.push(...placeData.visitWindows);
    }
  }
  const authoritativeVisitWindows = [
    ...manualVisitWindows,
    ...providerVisitWindows.filter(window => !manualVisitDates.has(window.date)),
  ].sort((left, right) =>
    left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  );

  const externalSnapshotIds = new Set<string>();
  if (expectedDuration.kind === "USER_CONFIRMED") {
    externalSnapshotIds.add(expectedDuration.externalSnapshotId);
  }
  for (const visit of facts.visitWindows) externalSnapshotIds.add(visit.snapshotId);
  if (knownPrice) externalSnapshotIds.add(knownPrice.externalSnapshotId);
  if (input.placeDetailsSnapshot) externalSnapshotIds.add(input.placeDetailsSnapshot.id);

  const hardChecks: ValidationHardCheck[] = [
    candidate.placeId && candidateIdFromPlaceId(candidate.placeId) === input.candidateId
      ? { check: "PLACE_IDENTITY", status: "PASS" }
      : { check: "PLACE_IDENTITY", status: "FAIL", reasonCode: "INVALID_PLACE_IDENTITY" },
    Number.isFinite(candidate.location.lat) && Number.isFinite(candidate.location.lng)
      ? { check: "LOCATION", status: "PASS" }
      : { check: "LOCATION", status: "NEEDS_CONFIRMATION", reasonCode: "MISSING_LOCATION" },
    expectedDuration.kind === "MISSING"
      ? { check: "DURATION", status: "NEEDS_CONFIRMATION", reasonCode: "MISSING_DURATION" }
      : { check: "DURATION", status: "PASS" },
    visitWindowCheck({
      placement: input.placement,
      manualVisitWindows,
      providerVisitWindows,
      placeDetailsFreshness,
    }),
  ];

  if (input.placement) {
    if (expectedDuration.kind !== "MISSING") {
      const placedDurationMinutes =
        input.placement.interval.endMinute - input.placement.interval.startMinute;
      if (placedDurationMinutes !== expectedDuration.durationMinutes) {
        throw new RangeError(
          `Candidate placement duration ${placedDurationMinutes} does not match authoritative expected duration ${expectedDuration.durationMinutes}`,
        );
      }
    }

    hardChecks.push(
      evaluateTripDateCheck({ interval: input.placement.interval, setup: input.trip }),
      evaluateDayWindowCheck({ interval: input.placement.interval, setup: input.trip }),
      evaluateFixedBookingConflictCheck({
        interval: input.placement.interval,
        confirmedBookingIntervals: input.placement.confirmedBookingIntervals,
      }),
    );
    if (input.placement.route) {
      const routeSnapshot = input.placement.route.snapshot;
      externalSnapshotIds.add(routeSnapshot.id);
      if (routeSnapshot.snapshot.kind !== "ROUTE") {
        throw new TypeError("Candidate route context requires a ROUTE snapshot");
      }
      const routeData = routeSnapshot.snapshot.data;
      if (routeData !== undefined) {
        if (routeData.transportMode !== input.trip.primaryTransport) {
          throw new RangeError("ROUTE snapshot transport mode does not match trip.primaryTransport");
        }
        const expectedRouteCacheKey = buildRouteCacheKey({
          origin: routeData.origin,
          destination: routeData.destination,
          transportMode: routeData.transportMode,
          departureBucket: routeData.departureBucket,
        });
        if (routeSnapshot.snapshot.cacheKey !== expectedRouteCacheKey) {
          throw new RangeError("ROUTE snapshot cache identity is inconsistent with normalized route data");
        }
      }
      if (routeSnapshot.snapshot.freshness === "FRESH" && routeData) {
        hardChecks.push(evaluateTravelTimeCheck({
          route: routeData,
          availableMinutes: input.placement.route.availableMinutes,
        }));
      } else if (routeSnapshot.snapshot.freshness === "STALE") {
        hardChecks.push({
          check: "ROUTE_TIME",
          status: "NEEDS_CONFIRMATION",
          reasonCode: "EXTERNAL_DATA_STALE",
        });
      } else {
        hardChecks.push({
          check: "ROUTE_TIME",
          status: "NEEDS_CONFIRMATION",
          reasonCode: "ROUTE_UNAVAILABLE",
        });
      }
    } else {
      hardChecks.push({ check: "ROUTE_TIME", status: "NOT_APPLICABLE" });
    }
  } else {
    hardChecks.push(
      { check: "TRIP_DATE", status: "NOT_APPLICABLE" },
      { check: "DAY_WINDOW", status: "NOT_APPLICABLE" },
      { check: "FIXED_BOOKING", status: "NOT_APPLICABLE" },
      { check: "ROUTE_TIME", status: "NOT_APPLICABLE" },
    );
  }

  hardChecks.push(
    { check: "OVERLAP", status: "NOT_APPLICABLE" },
    evaluateActivityBudgetCheck({
      currency: input.trip.activityBudgetCurrency,
      safeActivityBudgetCeiling: input.trip.safeActivityBudgetCeiling,
      knownActivityAmounts: knownPrice ? [knownPrice.amount] : [],
    }),
    evaluatePriceCheck(knownPrice?.costStatus ?? "UNKNOWN"),
  );

  return {
    candidateId: input.candidateId,
    planningCycle: input.trip.planningCycle,
    activityBudgetCurrency: input.trip.activityBudgetCurrency,
    primaryTransport: input.trip.primaryTransport,
    ...(input.placement ? { placementInterval: input.placement.interval } : {}),
    evaluation: evaluateValidationResult(hardChecks),
    expectedDuration,
    externalSnapshotIds: [...externalSnapshotIds].sort(),
    authoritativeVisitWindows,
    ...(knownPrice ? { knownPrice } : {}),
  };
}
