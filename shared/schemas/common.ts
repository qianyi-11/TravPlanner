import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const MAX_TRIP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function timeToMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function isValidTimeString(value: string): boolean {
  return timeToMinutes(value) !== null;
}

export function isValidDayWindow(startTime: string, endTime: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start !== null && end !== null && start < end;
}

export function isValidTripDateRange(startDate: string, endDate: string): boolean {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) return false;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return start <= end && (end - start) / DAY_MS + 1 <= MAX_TRIP_DAYS;
}

export function areDatesWithinTrip(
  dates: readonly string[],
  startDate: string,
  endDate: string,
): boolean {
  return dates.every(date =>
    isValidDateString(date) &&
    isValidTripDateRange(startDate, date) &&
    isValidTripDateRange(date, endDate),
  );
}

export const dateStringSchema = z.string()
  .regex(DATE_PATTERN)
  .refine(isValidDateString, "Invalid calendar date");
export const timeStringSchema = z.string()
  .regex(TIME_PATTERN)
  .refine(isValidTimeString, "Invalid time");
export const positiveMinutesSchema = z.number().int().positive();
export const firestoreTimestampSchema = z.custom<unknown>(val => val !== undefined, "Expected timestamp");
export const locationRefSchema = z.object({ placeId: z.string().min(1).optional(), name: z.string().min(1), lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
export const baseLocationSchema = locationRefSchema.extend({ source: z.enum(["GOOGLE_PLACES", "USER_CONFIRMED"]) });
export const dayWindowSchema = z.object({ startTime: timeStringSchema, endTime: timeStringSchema })
  .refine(value => isValidDayWindow(value.startTime, value.endTime), {
    message: "Day window must start before it ends",
    path: ["endTime"],
  });
export const dayOverrideSchema = z.object({ date: dateStringSchema, startTime: timeStringSchema.optional(), endTime: timeStringSchema.optional(), startLocation: locationRefSchema.optional(), endLocation: locationRefSchema.optional() })
  .refine(value => !value.startTime || !value.endTime || isValidDayWindow(value.startTime, value.endTime), {
    message: "Day window must start before it ends",
    path: ["endTime"],
  });
