import { describe, expect, it } from "vitest";
import {
  validationSnapshotDocumentSchema,
  type ValidationHardCheck,
} from "@travel-planner/shared";
import {
  createSameDayInterval,
  evaluateActivityBudgetCheck,
  evaluateDayWindowCheck,
  evaluateFixedBookingConflictCheck,
  evaluatePriceCheck,
  evaluateScheduleOverlapCheck,
  evaluateTravelLegFeasibility,
  evaluateTravelTimeCheck,
  evaluateTripDateCheck,
  evaluateValidationResult,
  evaluateVisitWindowCheck,
  intervalContains,
  intervalsOverlap,
  normalizeUserConfirmedVisitWindow,
  resolveEffectiveDayWindow,
} from "../../functions/src/validation";

const setup = {
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
  dayOverrides: [] as Array<{
    date: string;
    startTime?: string;
    endTime?: string;
  }>,
};

describe("Validation Phase 2 pure deterministic core", () => {
  describe("result reduction", () => {
    it("returns VALID when every applicable check passes", () => {
      const result = evaluateValidationResult([
        { check: "LOCATION", status: "PASS" },
        { check: "PRICE", status: "NOT_APPLICABLE" },
      ]);
      expect(result).toEqual({
        result: "VALID",
        schedulable: true,
        reasonCodes: [],
        hardChecks: [
          { check: "LOCATION", status: "PASS" },
          { check: "PRICE", status: "NOT_APPLICABLE" },
        ],
      });
      expect(validationSnapshotDocumentSchema.safeParse({
        planningCycle: 1,
        scope: "CANDIDATE",
        targetId: "candidate-1",
        externalSnapshotIds: [],
        checkedAt: 0,
        ...result,
      }).success).toBe(true);
    });

    it("makes known failure dominate unresolved uncertainty", () => {
      const result = evaluateValidationResult([
        { check: "PRICE", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" },
        { check: "DURATION", status: "FAIL", reasonCode: "MISSING_DURATION" },
      ]);
      expect(result.result).toBe("INVALID");
      expect(result.schedulable).toBe(false);
      expect(result.reasonCodes).toEqual(["MISSING_DURATION", "PRICE_UNKNOWN"]);
    });

    it("blocks scheduling-critical uncertainty but not PRICE/BUDGET-only uncertainty", () => {
      expect(evaluateValidationResult([
        { check: "DURATION", status: "NEEDS_CONFIRMATION", reasonCode: "MISSING_DURATION" },
      ])).toMatchObject({ result: "NEEDS_CONFIRMATION", schedulable: false });

      expect(evaluateValidationResult([
        { check: "ACTIVITY_BUDGET", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" },
        { check: "PRICE", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" },
      ])).toMatchObject({ result: "NEEDS_CONFIRMATION", schedulable: true });
    });

    it("canonicalizes output without mutating caller order", () => {
      const checks: ValidationHardCheck[] = [
        { check: "PRICE", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" },
        { check: "DAY_WINDOW", status: "FAIL", reasonCode: "OUTSIDE_DAY_WINDOW" },
        { check: "LOCATION", status: "PASS" },
      ];
      const original = checks.map(check => check.check);
      const result = evaluateValidationResult(checks);
      expect(result.hardChecks.map(check => check.check)).toEqual([
        "LOCATION",
        "DAY_WINDOW",
        "PRICE",
      ]);
      expect(result.reasonCodes).toEqual(["OUTSIDE_DAY_WINDOW", "PRICE_UNKNOWN"]);
      expect(checks.map(check => check.check)).toEqual(original);
    });

    it("fails fast on duplicate check identifiers", () => {
      expect(() => evaluateValidationResult([
        { check: "LOCATION", status: "PASS" },
        { check: "LOCATION", status: "PASS" },
      ])).toThrow(/duplicate/i);
    });
  });

  describe("half-open interval primitives", () => {
    it("treats touching endpoints as adjacent rather than overlapping", () => {
      const first = createSameDayInterval("2026-09-01", 600, 660);
      const second = createSameDayInterval("2026-09-01", 660, 720);
      expect(intervalsOverlap(first, second)).toBe(false);
      expect(intervalsOverlap(first, createSameDayInterval("2026-09-01", 659, 720))).toBe(true);
    });

    it("allows exact containment boundaries and normalized endMinute 1440", () => {
      const window = createSameDayInterval("2026-09-01", 0, 1440);
      const target = createSameDayInterval("2026-09-01", 0, 1440);
      expect(intervalContains(window, target)).toBe(true);
    });

    it("does not overlap intervals on different dates", () => {
      expect(intervalsOverlap(
        createSameDayInterval("2026-09-01", 600, 720),
        createSameDayInterval("2026-09-02", 600, 720),
      )).toBe(false);
    });
  });

  describe("trip dates and effective day windows", () => {
    it("treats trip boundaries as inclusive", () => {
      expect(evaluateTripDateCheck({
        interval: createSameDayInterval("2026-09-01", 540, 600),
        setup,
      })).toEqual({ check: "TRIP_DATE", status: "PASS" });
      expect(evaluateTripDateCheck({
        interval: createSameDayInterval("2026-09-03", 540, 600),
        setup,
      })).toEqual({ check: "TRIP_DATE", status: "PASS" });
      expect(evaluateTripDateCheck({
        interval: createSameDayInterval("2026-09-04", 540, 600),
        setup,
      })).toEqual({
        check: "TRIP_DATE",
        status: "FAIL",
        reasonCode: "OUTSIDE_TRIP_DATE",
      });
    });

    it("uses default windows and permits exact boundaries", () => {
      const interval = createSameDayInterval("2026-09-01", 540, 1080);
      expect(evaluateDayWindowCheck({ interval, setup })).toEqual({
        check: "DAY_WINDOW",
        status: "PASS",
      });
    });

    it("inherits omitted override boundaries", () => {
      const startOverride = {
        ...setup,
        dayOverrides: [{ date: "2026-09-02", startTime: "10:00" }],
      };
      expect(resolveEffectiveDayWindow("2026-09-02", startOverride)).toEqual(
        createSameDayInterval("2026-09-02", 600, 1080),
      );
      expect(evaluateDayWindowCheck({
        interval: createSameDayInterval("2026-09-02", 570, 630),
        setup: startOverride,
      })).toEqual({
        check: "DAY_WINDOW",
        status: "FAIL",
        reasonCode: "OUTSIDE_DAY_WINDOW",
      });

      const endOverride = {
        ...setup,
        dayOverrides: [{ date: "2026-09-02", endTime: "17:00" }],
      };
      expect(resolveEffectiveDayWindow("2026-09-02", endOverride)).toEqual(
        createSameDayInterval("2026-09-02", 540, 1020),
      );
    });

    it("makes day-window check not applicable outside trip and fails fast on duplicate overrides", () => {
      expect(evaluateDayWindowCheck({
        interval: createSameDayInterval("2026-09-04", 540, 600),
        setup,
      })).toEqual({ check: "DAY_WINDOW", status: "NOT_APPLICABLE" });

      expect(() => resolveEffectiveDayWindow("2026-09-02", {
        ...setup,
        dayOverrides: [
          { date: "2026-09-02", startTime: "10:00" },
          { date: "2026-09-02", endTime: "17:00" },
        ],
      })).toThrow(/duplicate/i);
    });
  });

  describe("visit windows", () => {
    it("normalizes valid USER_CONFIRMED windows and rejects invalid ones", () => {
      expect(normalizeUserConfirmedVisitWindow({
        date: "2026-09-01",
        startTime: "09:00",
        endTime: "18:00",
      })).toEqual({ date: "2026-09-01", startMinute: 540, endMinute: 1080 });
      expect(normalizeUserConfirmedVisitWindow({
        date: "2026-09-01",
        startTime: "09:00",
        endTime: "09:00",
      })).toBeNull();
      expect(normalizeUserConfirmedVisitWindow({
        date: "2026-09-01",
        startTime: "18:00",
        endTime: "09:00",
      })).toBeNull();
    });

    it("passes when any same-date authoritative window contains the interval", () => {
      expect(evaluateVisitWindowCheck({
        interval: createSameDayInterval("2026-09-01", 600, 660),
        visitWindows: [
          { date: "2026-09-01", startMinute: 480, endMinute: 540 },
          { date: "2026-09-01", startMinute: 540, endMinute: 720 },
        ],
        missingAuthoritativeVisitWindow: false,
      })).toEqual({ check: "VISIT_WINDOW", status: "PASS" });
    });

    it("distinguishes missing authority from a known invalid placement", () => {
      expect(evaluateVisitWindowCheck({
        interval: createSameDayInterval("2026-09-01", 600, 660),
        visitWindows: [],
        missingAuthoritativeVisitWindow: true,
      })).toEqual({
        check: "VISIT_WINDOW",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "MISSING_VISIT_WINDOW",
      });

      expect(evaluateVisitWindowCheck({
        interval: createSameDayInterval("2026-09-01", 600, 660),
        visitWindows: [{ date: "2026-09-01", startMinute: 480, endMinute: 540 }],
        missingAuthoritativeVisitWindow: false,
      })).toEqual({
        check: "VISIT_WINDOW",
        status: "FAIL",
        reasonCode: "INVALID_VISIT_WINDOW",
      });
    });

    it("accepts provider-normalized windows ending at minute 1440", () => {
      expect(evaluateVisitWindowCheck({
        interval: createSameDayInterval("2026-09-01", 1380, 1439),
        visitWindows: [{ date: "2026-09-01", startMinute: 1320, endMinute: 1440 }],
        missingAuthoritativeVisitWindow: false,
      })).toEqual({ check: "VISIT_WINDOW", status: "PASS" });
    });
  });

  describe("overlap and fixed booking conflicts", () => {
    it("detects true schedule overlap but allows touching boundaries", () => {
      const occupied = [createSameDayInterval("2026-09-01", 600, 660)];
      expect(evaluateScheduleOverlapCheck({
        interval: createSameDayInterval("2026-09-01", 630, 690),
        occupiedIntervals: occupied,
      })).toEqual({
        check: "OVERLAP",
        status: "FAIL",
        reasonCode: "SCHEDULE_OVERLAP",
      });
      expect(evaluateScheduleOverlapCheck({
        interval: createSameDayInterval("2026-09-01", 660, 720),
        occupiedIntervals: occupied,
      })).toEqual({ check: "OVERLAP", status: "PASS" });
    });

    it("keeps confirmed fixed bookings hard while permitting adjacency", () => {
      const bookings = [createSameDayInterval("2026-09-01", 600, 660)];
      expect(evaluateFixedBookingConflictCheck({
        interval: createSameDayInterval("2026-09-01", 620, 640),
        confirmedBookingIntervals: bookings,
      })).toEqual({
        check: "FIXED_BOOKING",
        status: "FAIL",
        reasonCode: "FIXED_BOOKING_CONFLICT",
      });
      expect(evaluateFixedBookingConflictCheck({
        interval: createSameDayInterval("2026-09-01", 660, 720),
        confirmedBookingIntervals: bookings,
      })).toEqual({ check: "FIXED_BOOKING", status: "PASS" });
      expect(evaluateFixedBookingConflictCheck({
        interval: createSameDayInterval("2026-09-02", 620, 640),
        confirmedBookingIntervals: bookings,
      })).toEqual({ check: "FIXED_BOOKING", status: "PASS" });
    });
  });

  describe("Activity Budget and price", () => {
    it("treats an absent ceiling as not applicable", () => {
      expect(evaluateActivityBudgetCheck({
        currency: "USD",
        knownActivityAmounts: [10],
      })).toEqual({ check: "ACTIVITY_BUDGET", status: "NOT_APPLICABLE" });
    });

    it("uses exact minor-unit arithmetic for equality and exceedance", () => {
      expect(evaluateActivityBudgetCheck({
        currency: "USD",
        safeActivityBudgetCeiling: 0.3,
        knownActivityAmounts: [0.1, 0.2],
      })).toEqual({ check: "ACTIVITY_BUDGET", status: "PASS" });
      expect(evaluateActivityBudgetCheck({
        currency: "USD",
        safeActivityBudgetCeiling: 0.3,
        knownActivityAmounts: [0.1, 0.21],
      })).toEqual({
        check: "ACTIVITY_BUDGET",
        status: "FAIL",
        reasonCode: "ACTIVITY_BUDGET_EXCEEDED",
      });
    });

    it("supports zero- and three-minor-unit currencies without rounding", () => {
      expect(evaluateActivityBudgetCheck({
        currency: "JPY",
        safeActivityBudgetCeiling: 100,
        knownActivityAmounts: [40, 60],
      }).status).toBe("PASS");
      expect(evaluateActivityBudgetCheck({
        currency: "BHD",
        safeActivityBudgetCeiling: 1.234,
        knownActivityAmounts: [1.234],
      }).status).toBe("PASS");
    });

    it("fails fast on unsupported currency or excess precision", () => {
      expect(() => evaluateActivityBudgetCheck({
        currency: "usd",
        safeActivityBudgetCeiling: 10,
        knownActivityAmounts: [1],
      })).toThrow();
      expect(() => evaluateActivityBudgetCheck({
        currency: "USD",
        safeActivityBudgetCeiling: 10,
        knownActivityAmounts: [0.001],
      })).toThrow();
    });

    it("keeps unknown price non-blocking for time scheduling", () => {
      const priceCheck = evaluatePriceCheck("UNKNOWN");
      expect(priceCheck).toEqual({
        check: "PRICE",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "PRICE_UNKNOWN",
      });
      expect(evaluateValidationResult([priceCheck])).toMatchObject({
        result: "NEEDS_CONFIRMATION",
        schedulable: true,
      });
      expect(evaluatePriceCheck("CONFIRMED")).toEqual({ check: "PRICE", status: "PASS" });
      expect(evaluatePriceCheck("ESTIMATED")).toEqual({ check: "PRICE", status: "PASS" });
    });
  });

  describe("travel feasibility", () => {
    it("applies locked buffers and passes the exact boundary", () => {
      expect(evaluateTravelTimeCheck({
        route: { transportMode: "WALKING", durationMinutes: 20 },
        availableMinutes: 30,
      })).toEqual({ check: "ROUTE_TIME", status: "PASS" });
      expect(evaluateTravelTimeCheck({
        route: { transportMode: "DRIVING", durationMinutes: 20 },
        availableMinutes: 29,
      })).toEqual({
        check: "ROUTE_TIME",
        status: "FAIL",
        reasonCode: "INSUFFICIENT_TRAVEL_TIME",
      });
      expect(evaluateTravelTimeCheck({
        route: { transportMode: "TRANSIT", durationMinutes: 20 },
        availableMinutes: 35,
      })).toEqual({ check: "ROUTE_TIME", status: "PASS" });
    });

    it("requires the safety buffer even for zero-duration routes", () => {
      expect(evaluateTravelLegFeasibility({
        route: { transportMode: "TRANSIT", durationMinutes: 0 },
        availableMinutes: 14,
      })).toMatchObject({ requiredMinutes: 15, feasible: false });
    });

    it("fails fast on invalid timing inputs", () => {
      expect(() => evaluateTravelLegFeasibility({
        route: { transportMode: "WALKING", durationMinutes: -1 },
        availableMinutes: 30,
      })).toThrow();
      expect(() => evaluateTravelLegFeasibility({
        route: { transportMode: "WALKING", durationMinutes: 20 },
        availableMinutes: 29.5,
      })).toThrow();
    });
  });
});
