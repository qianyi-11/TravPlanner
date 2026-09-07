import type {
  NormalizedVisitWindow,
  ValidationHardCheck,
} from "@travel-planner/shared";
import {
  assertValidSameDayInterval,
  intervalContains,
  sameDayIntervalFromTimes,
} from "./timeIntervals";
import type { SameDayInterval } from "./types";

export function normalizeUserConfirmedVisitWindow(input: {
  date: string;
  startTime: string;
  endTime: string;
}): NormalizedVisitWindow | null {
  const interval = sameDayIntervalFromTimes(
    input.date,
    input.startTime,
    input.endTime,
  );
  if (interval === null) return null;
  return {
    date: interval.date,
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
  };
}

function asInterval(window: NormalizedVisitWindow): SameDayInterval {
  const interval = {
    date: window.date,
    startMinute: window.startMinute,
    endMinute: window.endMinute,
  };
  assertValidSameDayInterval(interval);
  return interval;
}

export function evaluateVisitWindowCheck(input: {
  interval: SameDayInterval;
  visitWindows: readonly NormalizedVisitWindow[];
  missingAuthoritativeVisitWindow: boolean;
}): ValidationHardCheck {
  assertValidSameDayInterval(input.interval);
  const sameDateWindows = input.visitWindows
    .map(asInterval)
    .filter(window => window.date === input.interval.date);

  if (sameDateWindows.some(window => intervalContains(window, input.interval))) {
    return { check: "VISIT_WINDOW", status: "PASS" };
  }

  if (sameDateWindows.length === 0 && input.missingAuthoritativeVisitWindow) {
    return {
      check: "VISIT_WINDOW",
      status: "NEEDS_CONFIRMATION",
      reasonCode: "MISSING_VISIT_WINDOW",
    };
  }

  return {
    check: "VISIT_WINDOW",
    status: "FAIL",
    reasonCode: "INVALID_VISIT_WINDOW",
  };
}
