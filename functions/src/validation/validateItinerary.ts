import type {
  ValidationCheck,
  ValidationHardCheck,
} from "@travel-planner/shared";
import type { StoredExternalSnapshot } from "../integrations/externalSnapshots";
import { buildRouteCacheKey } from "../integrations/routeCacheKey";
import { evaluateActivityBudgetCheck } from "./activityBudgetFeasibility";
import { evaluateScheduleOverlapCheck } from "./scheduleOverlap";
import { evaluateTravelTimeCheck } from "./travelFeasibility";
import { evaluateValidationResult } from "./evaluateValidationResult";
import { orderValidationReasonCodes } from "./validationOrdering";
import type { SameDayInterval, ValidationEvaluation } from "./types";
import type { CandidateValidationOutput } from "./validateCandidate";

export interface ItineraryRouteLegValidationInput {
  snapshot: StoredExternalSnapshot;
  availableMinutes: number;
}

function aggregateCheck(
  check: ValidationCheck,
  checks: readonly ValidationHardCheck[],
): ValidationHardCheck {
  const relevant = checks.filter(entry => entry.check === check);
  if (relevant.length === 0 || relevant.every(entry => entry.status === "NOT_APPLICABLE")) {
    return { check, status: "NOT_APPLICABLE" };
  }

  const failed = relevant.filter(entry => entry.status === "FAIL");
  if (failed.length > 0) {
    const reasonCode = orderValidationReasonCodes(
      failed.flatMap(entry => entry.reasonCode ? [entry.reasonCode] : []),
    )[0];
    if (!reasonCode) throw new RangeError(`Failed ${check} check requires a reason`);
    return { check, status: "FAIL", reasonCode };
  }

  const unresolved = relevant.filter(entry => entry.status === "NEEDS_CONFIRMATION");
  if (unresolved.length > 0) {
    const reasonCode = orderValidationReasonCodes(
      unresolved.flatMap(entry => entry.reasonCode ? [entry.reasonCode] : []),
    )[0];
    if (!reasonCode) throw new RangeError(`Unresolved ${check} check requires a reason`);
    return { check, status: "NEEDS_CONFIRMATION", reasonCode };
  }

  return { check, status: "PASS" };
}

function routeTimeCheck(input: {
  routeLegs: readonly ItineraryRouteLegValidationInput[];
  routeSetComplete: boolean;
  expectedTransportMode?: CandidateValidationOutput["primaryTransport"];
}): { check: ValidationHardCheck; externalSnapshotIds: string[] } {
  const externalSnapshotIds: string[] = [];
  const checks: ValidationHardCheck[] = [];

  for (const leg of input.routeLegs) {
    externalSnapshotIds.push(leg.snapshot.id);
    if (leg.snapshot.snapshot.kind !== "ROUTE") {
      throw new TypeError("Itinerary route leg requires a ROUTE snapshot");
    }
    const routeData = leg.snapshot.snapshot.data;
    if (routeData !== undefined) {
      if (input.expectedTransportMode && routeData.transportMode !== input.expectedTransportMode) {
        throw new RangeError("Itinerary ROUTE transport mode does not match trip.primaryTransport");
      }
      const expectedRouteCacheKey = buildRouteCacheKey({
        origin: routeData.origin,
        destination: routeData.destination,
        transportMode: routeData.transportMode,
        departureBucket: routeData.departureBucket,
      });
      if (leg.snapshot.snapshot.cacheKey !== expectedRouteCacheKey) {
        throw new RangeError("Itinerary ROUTE cache identity is inconsistent with normalized route data");
      }
    }
    if (leg.snapshot.snapshot.freshness === "FRESH" && routeData) {
      checks.push(evaluateTravelTimeCheck({
        route: routeData,
        availableMinutes: leg.availableMinutes,
      }));
    } else if (leg.snapshot.snapshot.freshness === "STALE") {
      checks.push({
        check: "ROUTE_TIME",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "EXTERNAL_DATA_STALE",
      });
    } else {
      checks.push({
        check: "ROUTE_TIME",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "ROUTE_UNAVAILABLE",
      });
    }
  }

  if (!input.routeSetComplete) {
    checks.push({
      check: "ROUTE_TIME",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "ROUTE_UNAVAILABLE",
    });
  }

  return {
    check: checks.length === 0
      ? { check: "ROUTE_TIME", status: "NOT_APPLICABLE" }
      : aggregateCheck("ROUTE_TIME", checks),
    externalSnapshotIds,
  };
}

function overlapCheck(intervals: readonly SameDayInterval[]): ValidationHardCheck {
  const checks: ValidationHardCheck[] = [];
  for (let index = 0; index < intervals.length; index += 1) {
    checks.push(evaluateScheduleOverlapCheck({
      interval: intervals[index],
      occupiedIntervals: intervals.slice(0, index),
    }));
  }
  return checks.length === 0
    ? { check: "OVERLAP", status: "NOT_APPLICABLE" }
    : aggregateCheck("OVERLAP", checks);
}

export function evaluateItineraryValidation(input: {
  candidateValidations: readonly CandidateValidationOutput[];
  activityIntervals: readonly SameDayInterval[];
  routeLegs: readonly ItineraryRouteLegValidationInput[];
  routeSetComplete: boolean;
  currency: string;
  safeActivityBudgetCeiling?: number;
}): {
  evaluation: ValidationEvaluation;
  externalSnapshotIds: string[];
} {
  if (input.candidateValidations.length !== input.activityIntervals.length) {
    throw new RangeError("Itinerary activity intervals must align with candidate validations");
  }

  const firstCandidate = input.candidateValidations[0];
  for (let index = 0; index < input.candidateValidations.length; index += 1) {
    const candidateValidation = input.candidateValidations[index];
    const interval = input.activityIntervals[index];
    const validatedInterval = candidateValidation.placementInterval;
    if (
      !validatedInterval ||
      validatedInterval.date !== interval.date ||
      validatedInterval.startMinute !== interval.startMinute ||
      validatedInterval.endMinute !== interval.endMinute
    ) {
      throw new RangeError("Itinerary candidate validation is not bound to the supplied activity interval");
    }
    if (candidateValidation.activityBudgetCurrency !== input.currency) {
      throw new RangeError("Itinerary currency does not match candidate Validation authority");
    }
    if (candidateValidation.knownPrice && candidateValidation.knownPrice.currency !== input.currency) {
      throw new RangeError("Itinerary cannot reinterpret a candidate PRICE in another currency");
    }
    if (firstCandidate && (
      candidateValidation.planningCycle !== firstCandidate.planningCycle ||
      candidateValidation.primaryTransport !== firstCandidate.primaryTransport ||
      candidateValidation.activityBudgetCurrency !== firstCandidate.activityBudgetCurrency
    )) {
      throw new RangeError("Itinerary candidate validations do not share one authoritative planning context");
    }
  }

  const candidateChecks = input.candidateValidations.flatMap(item => item.evaluation.hardChecks);
  const route = routeTimeCheck({
    routeLegs: input.routeLegs,
    routeSetComplete: input.routeSetComplete,
    expectedTransportMode: firstCandidate?.primaryTransport,
  });
  const knownAmounts = input.candidateValidations.flatMap(item =>
    item.knownPrice ? [item.knownPrice.amount] : [],
  );

  const hardChecks: ValidationHardCheck[] = [
    aggregateCheck("PLACE_IDENTITY", candidateChecks),
    aggregateCheck("LOCATION", candidateChecks),
    aggregateCheck("DURATION", candidateChecks),
    aggregateCheck("VISIT_WINDOW", candidateChecks),
    aggregateCheck("TRIP_DATE", candidateChecks),
    aggregateCheck("DAY_WINDOW", candidateChecks),
    aggregateCheck("FIXED_BOOKING", candidateChecks),
    route.check,
    overlapCheck(input.activityIntervals),
    evaluateActivityBudgetCheck({
      currency: input.currency,
      safeActivityBudgetCeiling: input.safeActivityBudgetCeiling,
      knownActivityAmounts: knownAmounts,
    }),
    aggregateCheck("PRICE", candidateChecks),
  ];

  const externalSnapshotIds = [...new Set([
    ...input.candidateValidations.flatMap(item => item.externalSnapshotIds),
    ...route.externalSnapshotIds,
  ])].sort();

  return {
    evaluation: evaluateValidationResult(hardChecks),
    externalSnapshotIds,
  };
}
