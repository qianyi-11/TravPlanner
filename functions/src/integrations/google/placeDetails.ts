import {
  normalizedPlaceDetailsDataSchema,
  type NormalizedPlaceDetailsData,
  type NormalizedVisitWindow,
} from "@travel-planner/shared";
import { GOOGLE_MAPS_API_KEY } from "./places";
import { GoogleProviderError, isRetryableGoogleProviderError } from "./providerError";
import { retryProvider } from "../retryProvider";
import { getOrRefreshProviderSnapshot, type StoredExternalSnapshot } from "../externalSnapshots";
import {
  addLocalDateDays,
  enumerateLocalDates,
  formatDateInTimeZone,
  minuteOfDayInTimeZone,
  weekdayForLocalDate,
  zonedDateMinuteToUtcMs,
} from "../timezone";
import { buildPlaceDetailsCacheKey } from "../../validation/criticalFactScope";

export const PLACE_DETAILS_TTL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type FetchLike = typeof fetch;
type KeyProvider = () => string;

interface OpeningPoint {
  day: number;
  hour: number;
  minute: number;
}

interface OpeningPeriod {
  open: OpeningPoint;
  close?: OpeningPoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseOpeningPoint(value: unknown): OpeningPoint | null {
  if (!isRecord(value)) return null;
  const day = value.day;
  const hour = value.hour;
  const minute = value.minute;
  if (
    !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6 ||
    !Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23 ||
    !Number.isInteger(minute) || (minute as number) < 0 || (minute as number) > 59
  ) {
    return null;
  }
  return { day: day as number, hour: hour as number, minute: minute as number };
}

function parseOpeningPeriods(value: unknown): OpeningPeriod[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GoogleProviderError("Opening periods are malformed", false);
  return value.map(rawPeriod => {
    if (!isRecord(rawPeriod)) throw new GoogleProviderError("Opening period is malformed", false);
    const open = parseOpeningPoint(rawPeriod.open);
    const close = rawPeriod.close === undefined ? undefined : parseOpeningPoint(rawPeriod.close);
    if (!open || (rawPeriod.close !== undefined && !close)) {
      throw new GoogleProviderError("Opening period point is malformed", false);
    }
    return { open, ...(close ? { close } : {}) };
  });
}

function splitUtcIntervalIntoTripWindows(input: {
  startMs: number;
  endMs: number;
  tripStartDate: string;
  tripEndDate: string;
  tripTimezone: string;
}): NormalizedVisitWindow[] {
  const result: NormalizedVisitWindow[] = [];
  for (const date of enumerateLocalDates(input.tripStartDate, input.tripEndDate)) {
    const dayStart = zonedDateMinuteToUtcMs(date, 0, input.tripTimezone);
    const dayEnd = zonedDateMinuteToUtcMs(date, 1440, input.tripTimezone);
    const start = Math.max(input.startMs, dayStart);
    const end = Math.min(input.endMs, dayEnd);
    if (start >= end) continue;

    const startMinute = start === dayStart ? 0 : minuteOfDayInTimeZone(start, input.tripTimezone);
    const endMinute = end === dayEnd ? 1440 : minuteOfDayInTimeZone(end, input.tripTimezone);
    if (startMinute < endMinute) {
      result.push({ date, startMinute, endMinute });
    }
  }
  return result;
}

function normalizeRegularOpeningPeriods(input: {
  periods: readonly OpeningPeriod[];
  providerTimezone: string;
  tripTimezone: string;
  tripStartDate: string;
  tripEndDate: string;
}): NormalizedVisitWindow[] {
  if (input.periods.length === 0) return [];

  const alwaysOpen = input.periods.some(period =>
    period.close === undefined &&
    period.open.day === 0 &&
    period.open.hour === 0 &&
    period.open.minute === 0,
  );
  if (alwaysOpen) {
    return enumerateLocalDates(input.tripStartDate, input.tripEndDate).map(date => ({
      date,
      startMinute: 0,
      endMinute: 1440,
    }));
  }
  if (input.periods.some(period => period.close === undefined)) {
    throw new GoogleProviderError("Opening period without close is not canonical 24/7 data", false);
  }

  const tripStartMs = zonedDateMinuteToUtcMs(input.tripStartDate, 0, input.tripTimezone);
  const tripEndMs = zonedDateMinuteToUtcMs(input.tripEndDate, 1440, input.tripTimezone);
  const providerStartDate = formatDateInTimeZone(tripStartMs - 2 * DAY_MS, input.providerTimezone);
  const providerEndDate = formatDateInTimeZone(tripEndMs + 2 * DAY_MS, input.providerTimezone);
  const windows: NormalizedVisitWindow[] = [];

  for (const providerDate of enumerateLocalDates(providerStartDate, providerEndDate)) {
    const weekday = weekdayForLocalDate(providerDate);
    for (const period of input.periods) {
      if (period.open.day !== weekday || !period.close) continue;
      const openMinute = period.open.hour * 60 + period.open.minute;
      const closeMinute = period.close.hour * 60 + period.close.minute;
      const closeDayOffset = (period.close.day - period.open.day + 7) % 7;
      if (closeDayOffset === 0 && closeMinute <= openMinute) {
        throw new GoogleProviderError("Opening period has a non-positive weekly interval", false);
      }
      const closeDate = addLocalDateDays(providerDate, closeDayOffset);
      const openMs = zonedDateMinuteToUtcMs(providerDate, openMinute, input.providerTimezone);
      const closeMs = zonedDateMinuteToUtcMs(closeDate, closeMinute, input.providerTimezone);
      if (closeMs <= openMs) {
        throw new GoogleProviderError("Opening period does not advance in time", false);
      }
      windows.push(...splitUtcIntervalIntoTripWindows({
        startMs: Math.max(openMs, tripStartMs),
        endMs: Math.min(closeMs, tripEndMs),
        tripStartDate: input.tripStartDate,
        tripEndDate: input.tripEndDate,
        tripTimezone: input.tripTimezone,
      }));
    }
  }

  const unique = new Map<string, NormalizedVisitWindow>();
  for (const window of windows) {
    unique.set(`${window.date}:${window.startMinute}:${window.endMinute}`, window);
  }
  return [...unique.values()].sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.startMinute - right.startMinute ||
    left.endMinute - right.endMinute,
  );
}

export async function fetchGooglePlaceDetailsData(input: {
  placeId: string;
  tripTimezone: string;
  tripStartDate: string;
  tripEndDate: string;
  fetchImpl?: FetchLike;
  keyProvider?: KeyProvider;
}): Promise<NormalizedPlaceDetailsData> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const keyProvider = input.keyProvider ?? (() => GOOGLE_MAPS_API_KEY.value());
  let key: string;
  try {
    key = keyProvider();
  } catch {
    throw new GoogleProviderError("Google Places key is unavailable", false);
  }
  if (!key) throw new GoogleProviderError("Google Places key is unavailable", false);

  const body = await retryProvider(async () => {
    let response: Response;
    try {
      response = await fetchImpl(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}`,
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "id,location,types,timeZone,regularOpeningHours.periods",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new GoogleProviderError("Google Places request failed", true);
    }
    if (response.status === 404) throw new GoogleProviderError("Place was not found", false);
    if (!response.ok) {
      throw new GoogleProviderError(
        `Google Places returned HTTP ${response.status}`,
        [429, 500, 502, 503, 504].includes(response.status),
      );
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new GoogleProviderError("Google Places returned invalid JSON", true);
    }
  }, { maxAttempts: 3, shouldRetry: isRetryableGoogleProviderError });

  if (!isRecord(body) || body.id !== input.placeId) {
    throw new GoogleProviderError("Google Places identity is invalid", false);
  }
  const location = isRecord(body.location) ? body.location : null;
  const timeZone = isRecord(body.timeZone) ? body.timeZone.id : undefined;
  const types = body.types;
  if (
    !location ||
    typeof location.latitude !== "number" || !Number.isFinite(location.latitude) ||
    typeof location.longitude !== "number" || !Number.isFinite(location.longitude) ||
    typeof timeZone !== "string" || !timeZone ||
    (types !== undefined && (!Array.isArray(types) || !types.every(type => typeof type === "string" && type.length > 0)))
  ) {
    throw new GoogleProviderError("Google Places normalized fields are invalid", false);
  }

  const openingHours = isRecord(body.regularOpeningHours) ? body.regularOpeningHours : undefined;
  const periods = parseOpeningPeriods(openingHours?.periods);
  const visitWindows = normalizeRegularOpeningPeriods({
    periods,
    providerTimezone: timeZone,
    tripTimezone: input.tripTimezone,
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
  });

  return normalizedPlaceDetailsDataSchema.parse({
    placeId: input.placeId,
    location: { lat: location.latitude, lng: location.longitude },
    placeTypes: types === undefined ? [] : types,
    visitWindows,
  });
}

export async function getGooglePlaceDetailsSnapshot(input: {
  tripId: string;
  placeId: string;
  tripTimezone: string;
  tripStartDate: string;
  tripEndDate: string;
  fetchImpl?: FetchLike;
  keyProvider?: KeyProvider;
}): Promise<StoredExternalSnapshot> {
  const cacheKey = buildPlaceDetailsCacheKey({
    placeId: input.placeId,
    timezone: input.tripTimezone,
    startDate: input.tripStartDate,
    endDate: input.tripEndDate,
  });
  return getOrRefreshProviderSnapshot({
    tripId: input.tripId,
    cacheKey,
    kind: "PLACE_DETAILS",
    provider: "GOOGLE_PLACES",
    source: "GOOGLE_PLACES_API_NEW",
    ttlMs: PLACE_DETAILS_TTL_MS,
    fetchData: () => fetchGooglePlaceDetailsData(input),
  });
}
