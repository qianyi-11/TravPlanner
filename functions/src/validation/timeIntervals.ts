import {
  isValidDateString,
  timeToMinutes,
} from "@travel-planner/shared";
import type { SameDayInterval } from "./types";

export function assertValidSameDayInterval(interval: SameDayInterval): void {
  if (!isValidDateString(interval.date)) {
    throw new RangeError("interval date must be a valid YYYY-MM-DD calendar date");
  }
  if (
    !Number.isInteger(interval.startMinute) ||
    !Number.isInteger(interval.endMinute) ||
    interval.startMinute < 0 ||
    interval.startMinute > 1439 ||
    interval.endMinute < 1 ||
    interval.endMinute > 1440 ||
    interval.startMinute >= interval.endMinute
  ) {
    throw new RangeError("interval must satisfy 0 <= startMinute < endMinute <= 1440");
  }
}

export function createSameDayInterval(
  date: string,
  startMinute: number,
  endMinute: number,
): SameDayInterval {
  const interval = { date, startMinute, endMinute };
  assertValidSameDayInterval(interval);
  return interval;
}

export function sameDayIntervalFromTimes(
  date: string,
  startTime: string,
  endTime: string,
): SameDayInterval | null {
  if (!isValidDateString(date)) return null;
  const startMinute = timeToMinutes(startTime);
  const endMinute = timeToMinutes(endTime);
  if (
    startMinute === null ||
    endMinute === null ||
    startMinute >= endMinute
  ) {
    return null;
  }
  return { date, startMinute, endMinute };
}

/** Half-open containment: matching boundaries are allowed. */
export function intervalContains(
  container: SameDayInterval,
  target: SameDayInterval,
): boolean {
  assertValidSameDayInterval(container);
  assertValidSameDayInterval(target);
  return container.date === target.date &&
    container.startMinute <= target.startMinute &&
    target.endMinute <= container.endMinute;
}

/** Half-open overlap: endpoint-touching intervals do not overlap. */
export function intervalsOverlap(
  left: SameDayInterval,
  right: SameDayInterval,
): boolean {
  assertValidSameDayInterval(left);
  assertValidSameDayInterval(right);
  return left.date === right.date &&
    left.startMinute < right.endMinute &&
    right.startMinute < left.endMinute;
}

export function compareSameDayIntervals(
  left: SameDayInterval,
  right: SameDayInterval,
): number {
  const dateOrder = left.date.localeCompare(right.date);
  if (dateOrder !== 0) return dateOrder;
  if (left.startMinute !== right.startMinute) {
    return left.startMinute - right.startMinute;
  }
  return left.endMinute - right.endMinute;
}
