import {
  areDatesWithinTrip,
  isValidDayWindow,
  isValidTripDateRange,
  timeToMinutes,
  type EffectiveTripSetup,
  type ValidationHardCheck,
} from "@travel-planner/shared";
import {
  assertValidSameDayInterval,
  createSameDayInterval,
  intervalContains,
} from "./timeIntervals";
import type { SameDayInterval } from "./types";

export type DayWindowSetup = Pick<
  EffectiveTripSetup,
  "startDate" | "endDate" | "defaultDayWindow" | "dayOverrides"
>;

function assertValidDayWindowSetup(setup: DayWindowSetup): void {
  if (!isValidTripDateRange(setup.startDate, setup.endDate)) {
    throw new RangeError("Trip date range is invalid");
  }
  if (!isValidDayWindow(
    setup.defaultDayWindow.startTime,
    setup.defaultDayWindow.endTime,
  )) {
    throw new RangeError("Default day window is invalid");
  }

  const overrideDates = setup.dayOverrides.map(override => override.date);
  if (new Set(overrideDates).size !== overrideDates.length) {
    throw new RangeError("Duplicate day override dates are invalid");
  }
  if (!areDatesWithinTrip(overrideDates, setup.startDate, setup.endDate)) {
    throw new RangeError("Day override date is outside the trip range");
  }

  for (const override of setup.dayOverrides) {
    const startTime = override.startTime ?? setup.defaultDayWindow.startTime;
    const endTime = override.endTime ?? setup.defaultDayWindow.endTime;
    if (!isValidDayWindow(startTime, endTime)) {
      throw new RangeError(`Effective day window is invalid for ${override.date}`);
    }
  }
}

function isDateInsideTrip(date: string, setup: DayWindowSetup): boolean {
  return areDatesWithinTrip([date], setup.startDate, setup.endDate);
}

export function resolveEffectiveDayWindow(
  date: string,
  setup: DayWindowSetup,
): SameDayInterval | null {
  assertValidDayWindowSetup(setup);
  if (!isDateInsideTrip(date, setup)) return null;

  const override = setup.dayOverrides.find(entry => entry.date === date);
  const startTime = override?.startTime ?? setup.defaultDayWindow.startTime;
  const endTime = override?.endTime ?? setup.defaultDayWindow.endTime;
  const startMinute = timeToMinutes(startTime);
  const endMinute = timeToMinutes(endTime);

  if (startMinute === null || endMinute === null) {
    throw new RangeError("Effective day window contains invalid time values");
  }
  return createSameDayInterval(date, startMinute, endMinute);
}

export function evaluateTripDateCheck(input: {
  interval: SameDayInterval;
  setup: DayWindowSetup;
}): ValidationHardCheck {
  assertValidSameDayInterval(input.interval);
  assertValidDayWindowSetup(input.setup);
  return isDateInsideTrip(input.interval.date, input.setup)
    ? { check: "TRIP_DATE", status: "PASS" }
    : {
        check: "TRIP_DATE",
        status: "FAIL",
        reasonCode: "OUTSIDE_TRIP_DATE",
      };
}

export function evaluateDayWindowCheck(input: {
  interval: SameDayInterval;
  setup: DayWindowSetup;
}): ValidationHardCheck {
  assertValidSameDayInterval(input.interval);
  const effectiveWindow = resolveEffectiveDayWindow(input.interval.date, input.setup);
  if (effectiveWindow === null) {
    return { check: "DAY_WINDOW", status: "NOT_APPLICABLE" };
  }

  return intervalContains(effectiveWindow, input.interval)
    ? { check: "DAY_WINDOW", status: "PASS" }
    : {
        check: "DAY_WINDOW",
        status: "FAIL",
        reasonCode: "OUTSIDE_DAY_WINDOW",
      };
}
