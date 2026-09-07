import type { DayWindowSetup } from "../validation/dayWindow";
import { enumerateInclusiveDateStrings } from "../validation/criticalFactScope";
import { resolveEffectiveDayWindow } from "../validation/dayWindow";
import type { ShortlistCapacityResult } from "./types";

export interface ConfirmedBookingOccupancy {
  date: string;
  startMinute: number;
  endMinute: number;
}

export function deterministicMedian(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.some(value => !Number.isInteger(value) || value < 0)) {
    throw new RangeError("Median inputs must be non-negative integers");
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.ceil((sorted[middle - 1] + sorted[middle]) / 2);
}

export function unionOccupiedMinutesWithinWindow(input: {
  date: string;
  windowStartMinute: number;
  windowEndMinute: number;
  bookings: readonly ConfirmedBookingOccupancy[];
}): number {
  const clipped = input.bookings
    .filter(booking => booking.date === input.date)
    .map(booking => ({
      start: Math.max(input.windowStartMinute, booking.startMinute),
      end: Math.min(input.windowEndMinute, booking.endMinute),
    }))
    .filter(interval => interval.start < interval.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  if (clipped.length === 0) return 0;

  let total = 0;
  let currentStart = clipped[0].start;
  let currentEnd = clipped[0].end;
  for (const interval of clipped.slice(1)) {
    if (interval.start < currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  return total + currentEnd - currentStart;
}

export function calculateTotalUsableMinutes(input: {
  setup: DayWindowSetup;
  confirmedBookings: readonly ConfirmedBookingOccupancy[];
}): number {
  return enumerateInclusiveDateStrings(input.setup.startDate, input.setup.endDate)
    .reduce((sum, date) => {
      const window = resolveEffectiveDayWindow(date, input.setup);
      if (!window) return sum;
      const occupied = unionOccupiedMinutesWithinWindow({
        date,
        windowStartMinute: window.startMinute,
        windowEndMinute: window.endMinute,
        bookings: input.confirmedBookings,
      });
      return sum + Math.max(0, window.endMinute - window.startMinute - occupied);
    }, 0);
}

export function calculateShortlistCapacity(input: {
  totalUsableMinutes: number;
  expectedDurations: readonly number[];
  representativeTravelMinutes: readonly number[];
  mustDoCount: number;
}): ShortlistCapacityResult {
  if (!Number.isInteger(input.totalUsableMinutes) || input.totalUsableMinutes < 0) {
    throw new RangeError("totalUsableMinutes must be a non-negative integer");
  }
  if (!Number.isInteger(input.mustDoCount) || input.mustDoCount < 0) {
    throw new RangeError("mustDoCount must be a non-negative integer");
  }

  const medianCandidateDuration = deterministicMedian(input.expectedDurations);
  const medianRepresentativeTravelMinutes = deterministicMedian(input.representativeTravelMinutes);

  if (medianRepresentativeTravelMinutes === undefined) {
    return {
      totalUsableMinutes: input.totalUsableMinutes,
      ...(medianCandidateDuration === undefined ? {} : { medianCandidateDuration }),
      ordinaryCapacity: 15,
      usedZeroTravelFallback: true,
      missingDurationMedian: medianCandidateDuration === undefined,
    };
  }

  if (medianCandidateDuration === undefined) {
    return {
      totalUsableMinutes: input.totalUsableMinutes,
      medianRepresentativeTravelMinutes,
      ordinaryCapacity: 0,
      usedZeroTravelFallback: false,
      missingDurationMedian: true,
    };
  }

  const denominator = medianCandidateDuration + medianRepresentativeTravelMinutes;
  if (denominator <= 0) throw new RangeError("Capacity denominator must be positive");
  const estimatedSlots = input.totalUsableMinutes / denominator;
  const detailedValidationTarget = Math.ceil(1.5 * estimatedSlots);
  const ordinaryCapacity = Math.min(15, Math.max(0, detailedValidationTarget - input.mustDoCount));
  return {
    totalUsableMinutes: input.totalUsableMinutes,
    medianCandidateDuration,
    medianRepresentativeTravelMinutes,
    estimatedSlots,
    detailedValidationTarget,
    ordinaryCapacity,
    usedZeroTravelFallback: false,
    missingDurationMedian: false,
  };
}
