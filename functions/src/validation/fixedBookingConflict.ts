import type { ValidationHardCheck } from "@travel-planner/shared";
import { assertValidSameDayInterval, intervalsOverlap } from "./timeIntervals";
import type { SameDayInterval } from "./types";

/**
 * Evaluates a proposed interval against already-normalized authoritative
 * CONFIRMED fixed-booking intervals. Booking lifecycle/filtering stays in
 * Bookings/orchestration.
 */
export function evaluateFixedBookingConflictCheck(input: {
  interval: SameDayInterval;
  confirmedBookingIntervals: readonly SameDayInterval[];
}): ValidationHardCheck {
  assertValidSameDayInterval(input.interval);
  for (const booking of input.confirmedBookingIntervals) {
    assertValidSameDayInterval(booking);
    if (intervalsOverlap(input.interval, booking)) {
      return {
        check: "FIXED_BOOKING",
        status: "FAIL",
        reasonCode: "FIXED_BOOKING_CONFLICT",
      };
    }
  }
  return { check: "FIXED_BOOKING", status: "PASS" };
}
