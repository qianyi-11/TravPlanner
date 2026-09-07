import { describe, expect, it } from "vitest";
import {
  createTripInputSchema,
  validateEffectiveTripSetup,
  type ValidationHardCheck,
} from "@travel-planner/shared";
import {
  exceedsActivityBudgetCeiling,
  sumExactMinorUnits,
  toExactMinorUnits,
} from "../../functions/src/validation/money";
import {
  evaluateTravelLegFeasibility,
  travelSafetyBufferMinutes,
} from "../../functions/src/validation/travelFeasibility";
import {
  orderValidationHardChecks,
  orderValidationReasonCodes,
} from "../../functions/src/validation/validationOrdering";

const baseTripSetup = {
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
  dayOverrides: [] as Array<{
    date: string;
    startTime?: string;
    endTime?: string;
  }>,
  baseLocation: {
    name: "Base",
    lat: 3.139,
    lng: 101.6869,
    source: "USER_CONFIRMED" as const,
  },
};

const baseCreateTripInput = {
  name: "Trip",
  destinationPlaceId: "destination-place",
  ...baseTripSetup,
  primaryTransport: "TRANSIT" as const,
  activityBudgetCurrency: "MYR",
};

describe("Validation Phase 2 residual decisions", () => {
  it("rejects duplicate day override dates instead of inventing precedence", () => {
    const dayOverrides = [
      { date: "2026-09-02", startTime: "10:00" },
      { date: "2026-09-02", endTime: "17:00" },
    ];

    expect(validateEffectiveTripSetup({ ...baseTripSetup, dayOverrides })).toBe(false);
    expect(createTripInputSchema.safeParse({
      ...baseCreateTripInput,
      dayOverrides,
    }).success).toBe(false);
    expect(createTripInputSchema.safeParse({
      ...baseCreateTripInput,
      dayOverrides: [{ date: "2026-09-02", startTime: "10:00" }],
    }).success).toBe(true);
  });

  it("orders hard checks and reason codes by canonical enum order", () => {
    const hardChecks: ValidationHardCheck[] = [
      { check: "PRICE", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" },
      { check: "LOCATION", status: "PASS" },
      { check: "DURATION", status: "FAIL", reasonCode: "MISSING_DURATION" },
    ];
    const reasonCodes = [
      "PRICE_UNKNOWN",
      "OUTSIDE_DAY_WINDOW",
      "MISSING_DURATION",
    ] as const;

    expect(orderValidationHardChecks(hardChecks).map(check => check.check)).toEqual([
      "LOCATION",
      "DURATION",
      "PRICE",
    ]);
    expect(orderValidationReasonCodes(reasonCodes)).toEqual([
      "MISSING_DURATION",
      "OUTSIDE_DAY_WINDOW",
      "PRICE_UNKNOWN",
    ]);
    expect(hardChecks.map(check => check.check)).toEqual(["PRICE", "LOCATION", "DURATION"]);
  });

  it("uses exact minor-unit arithmetic without silent rounding", () => {
    expect(toExactMinorUnits(0.1, "USD")).toBe(10n);
    expect(toExactMinorUnits(0.2, "USD")).toBe(20n);
    expect(sumExactMinorUnits([0.1, 0.2], "USD")).toBe(30n);
    expect(toExactMinorUnits(0.3, "USD")).toBe(30n);
    expect(exceedsActivityBudgetCeiling({ amounts: [0.1, 0.2], ceiling: 0.3, currency: "USD" })).toBe(false);
    expect(exceedsActivityBudgetCeiling({ amounts: [0.1, 0.21], ceiling: 0.3, currency: "USD" })).toBe(true);
    expect(toExactMinorUnits(0.001, "USD")).toBeNull();
    expect(toExactMinorUnits(100.5, "JPY")).toBeNull();
    expect(toExactMinorUnits(0, "USD")).toBe(0n);
    expect(toExactMinorUnits(1, "usd")).toBeNull();
  });

  it("evaluates only supplied route-leg timing with locked safety buffers", () => {
    expect(travelSafetyBufferMinutes("WALKING")).toBe(10);
    expect(travelSafetyBufferMinutes("DRIVING")).toBe(10);
    expect(travelSafetyBufferMinutes("TRANSIT")).toBe(15);

    expect(evaluateTravelLegFeasibility({
      route: { transportMode: "WALKING", durationMinutes: 20 },
      availableMinutes: 30,
    })).toMatchObject({
      safetyBufferMinutes: 10,
      requiredMinutes: 30,
      feasible: true,
    });

    expect(evaluateTravelLegFeasibility({
      route: { transportMode: "WALKING", durationMinutes: 20 },
      availableMinutes: 29,
    }).feasible).toBe(false);

    expect(evaluateTravelLegFeasibility({
      route: { transportMode: "TRANSIT", durationMinutes: 20 },
      availableMinutes: 35,
    })).toMatchObject({
      safetyBufferMinutes: 15,
      requiredMinutes: 35,
      feasible: true,
    });
  });
});
