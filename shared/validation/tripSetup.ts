import {
  areDatesWithinTrip,
  baseLocationSchema,
  dayOverrideSchema,
  dayWindowSchema,
  isValidDayWindow,
  isValidTripDateRange,
  locationRefSchema,
} from "../schemas/common";
import type { z } from "zod";

export type EffectiveTripSetup = {
  startDate: string;
  endDate: string;
  defaultDayWindow: z.infer<typeof dayWindowSchema>;
  dayOverrides: readonly z.infer<typeof dayOverrideSchema>[];
  baseLocation: z.infer<typeof baseLocationSchema>;
};

function hasValidCoordinates(location: z.infer<typeof locationRefSchema>): boolean {
  return Number.isFinite(location.lat) &&
    location.lat >= -90 && location.lat <= 90 &&
    Number.isFinite(location.lng) &&
    location.lng >= -180 && location.lng <= 180;
}

/** Validates the complete trip setup after any partial patch has been merged. */
export function validateEffectiveTripSetup(setup: EffectiveTripSetup): boolean {
  if (!isValidTripDateRange(setup.startDate, setup.endDate)) return false;

  const overrideDates = setup.dayOverrides.map(override => override.date);
  if (new Set(overrideDates).size !== overrideDates.length) return false;
  if (!areDatesWithinTrip(
    overrideDates,
    setup.startDate,
    setup.endDate,
  )) return false;
  if (!isValidDayWindow(setup.defaultDayWindow.startTime, setup.defaultDayWindow.endTime)) {
    return false;
  }
  if (!hasValidCoordinates(setup.baseLocation)) return false;

  return setup.dayOverrides.every(override => {
    const startTime = override.startTime ?? setup.defaultDayWindow.startTime;
    const endTime = override.endTime ?? setup.defaultDayWindow.endTime;
    return isValidDayWindow(startTime, endTime) &&
      (!override.startLocation || hasValidCoordinates(override.startLocation)) &&
      (!override.endLocation || hasValidCoordinates(override.endLocation));
  });
}
