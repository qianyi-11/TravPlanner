import type { ValidationHardCheck } from "@travel-planner/shared";
import { assertValidSameDayInterval, intervalsOverlap } from "./timeIntervals";
import type { SameDayInterval } from "./types";

export function evaluateScheduleOverlapCheck(input: {
  interval: SameDayInterval;
  occupiedIntervals: readonly SameDayInterval[];
}): ValidationHardCheck {
  assertValidSameDayInterval(input.interval);
  for (const occupied of input.occupiedIntervals) {
    assertValidSameDayInterval(occupied);
    if (intervalsOverlap(input.interval, occupied)) {
      return {
        check: "OVERLAP",
        status: "FAIL",
        reasonCode: "SCHEDULE_OVERLAP",
      };
    }
  }
  return { check: "OVERLAP", status: "PASS" };
}
