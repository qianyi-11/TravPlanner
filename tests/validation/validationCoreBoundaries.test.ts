import { describe, expect, it } from "vitest";
import {
  createSameDayInterval,
  evaluateFixedBookingConflictCheck,
  evaluateScheduleOverlapCheck,
  evaluateValidationResult,
  resolveEffectiveDayWindow,
} from "../../functions/src/validation";

describe("Validation Phase 2 boundary regressions", () => {
  it("keeps ACTIVITY_BUDGET-only uncertainty schedulable", () => {
    expect(evaluateValidationResult([
      {
        check: "ACTIVITY_BUDGET",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "PRICE_UNKNOWN",
      },
    ])).toMatchObject({
      result: "NEEDS_CONFIRMATION",
      schedulable: true,
    });
  });

  it("fails fast when an inherited override creates an invalid effective day window", () => {
    expect(() => resolveEffectiveDayWindow("2026-09-02", {
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      dayOverrides: [{ date: "2026-09-02", startTime: "19:00" }],
    })).toThrow(/invalid/i);
  });

  it("treats identical intervals as overlap", () => {
    const interval = createSameDayInterval("2026-09-01", 600, 660);
    expect(evaluateScheduleOverlapCheck({
      interval,
      occupiedIntervals: [interval],
    })).toEqual({
      check: "OVERLAP",
      status: "FAIL",
      reasonCode: "SCHEDULE_OVERLAP",
    });
  });

  it("makes fixed-booking conflict independent of input order", () => {
    const interval = createSameDayInterval("2026-09-01", 600, 660);
    const first = createSameDayInterval("2026-09-01", 480, 540);
    const conflicting = createSameDayInterval("2026-09-01", 630, 690);
    const last = createSameDayInterval("2026-09-01", 720, 780);

    const forward = evaluateFixedBookingConflictCheck({
      interval,
      confirmedBookingIntervals: [first, conflicting, last],
    });
    const reverse = evaluateFixedBookingConflictCheck({
      interval,
      confirmedBookingIntervals: [last, conflicting, first],
    });
    expect(forward).toEqual(reverse);
    expect(forward).toEqual({
      check: "FIXED_BOOKING",
      status: "FAIL",
      reasonCode: "FIXED_BOOKING_CONFLICT",
    });
  });
});
