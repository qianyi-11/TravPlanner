import { isValidDateString, timeToMinutes } from "./date-time";

export interface SameDayInterval {
  date: string;
  startMinute: number;
  endMinute: number;
}

export function createSameDayInterval(date: string, startMinute: number, endMinute: number): SameDayInterval | null {
  if (!isValidDateString(date) || !Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || startMinute >= endMinute || endMinute > 1440) return null;
  return { date, startMinute, endMinute };
}

export function sameDayIntervalFromTimes(date: string, start: string, end: string): SameDayInterval | null {
  const startMinute = timeToMinutes(start);
  const endMinute = timeToMinutes(end);
  return startMinute === null || endMinute === null ? null : createSameDayInterval(date, startMinute, endMinute);
}

export function intervalContains(outer: SameDayInterval, inner: SameDayInterval): boolean {
  return outer.date === inner.date && outer.startMinute <= inner.startMinute && inner.endMinute <= outer.endMinute;
}

export function intervalsOverlap(a: SameDayInterval, b: SameDayInterval): boolean {
  return a.date === b.date && a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export function compareSameDayIntervals(a: SameDayInterval, b: SameDayInterval): number {
  return a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.endMinute - b.endMinute;
}
