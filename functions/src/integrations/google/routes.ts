import {
  normalizedRouteDataSchema,
  type NormalizedRouteData,
  type TransportMode,
} from "@travel-planner/shared";
import { GOOGLE_MAPS_API_KEY } from "./places";
import { GoogleProviderError, isRetryableGoogleProviderError } from "./providerError";
import { retryProvider } from "../retryProvider";
import {
  buildRouteCacheKey,
  routeDepartureBucket,
  type RouteCoordinate,
} from "../routeCacheKey";
import { zonedDateMinuteToUtcMs } from "../timezone";
import { getOrRefreshProviderSnapshot, type StoredExternalSnapshot } from "../externalSnapshots";

export const ROUTE_TTL_MS = 60 * 60 * 1000;

type FetchLike = typeof fetch;
type KeyProvider = () => string;

function travelModeForGoogle(mode: TransportMode): "WALK" | "DRIVE" | "TRANSIT" {
  switch (mode) {
    case "WALKING": return "WALK";
    case "DRIVING": return "DRIVE";
    case "TRANSIT": return "TRANSIT";
  }
}

function parseDurationMinutes(value: unknown): number {
  if (typeof value !== "string") {
    throw new GoogleProviderError("Route duration is missing", false);
  }
  const match = /^(\d+)(?:\.(\d+))?s$/.exec(value);
  if (!match) throw new GoogleProviderError("Route duration is malformed", false);
  const wholeSeconds = Number(match[1]);
  const fractionalSeconds = match[2] ? Number(`0.${match[2]}`) : 0;
  const seconds = wholeSeconds + fractionalSeconds;
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new GoogleProviderError("Route duration is invalid", false);
  }
  return Math.ceil(seconds / 60);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchGoogleRouteData(input: {
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  transportMode: TransportMode;
  departureDate: string;
  departureMinute: number;
  tripTimezone: string;
  fetchImpl?: FetchLike;
  keyProvider?: KeyProvider;
}): Promise<NormalizedRouteData> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const keyProvider = input.keyProvider ?? (() => GOOGLE_MAPS_API_KEY.value());
  let key: string;
  try {
    key = keyProvider();
  } catch {
    throw new GoogleProviderError("Google Routes key is unavailable", false);
  }
  if (!key) throw new GoogleProviderError("Google Routes key is unavailable", false);

  const departureBucket = routeDepartureBucket({
    date: input.departureDate,
    departureMinute: input.departureMinute,
  });
  const departureMs = zonedDateMinuteToUtcMs(
    departureBucket.date,
    departureBucket.startMinute,
    input.tripTimezone,
  );
  const requestBody = {
    origin: {
      location: {
        latLng: {
          latitude: input.origin.lat,
          longitude: input.origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: input.destination.lat,
          longitude: input.destination.lng,
        },
      },
    },
    travelMode: travelModeForGoogle(input.transportMode),
    departureTime: new Date(departureMs).toISOString(),
  };

  const body = await retryProvider(async () => {
    let response: Response;
    try {
      response = await fetchImpl(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "routes.duration",
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new GoogleProviderError("Google Routes request failed", true);
    }
    if (!response.ok) {
      throw new GoogleProviderError(
        `Google Routes returned HTTP ${response.status}`,
        [429, 500, 502, 503, 504].includes(response.status),
      );
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new GoogleProviderError("Google Routes returned invalid JSON", true);
    }
  }, { maxAttempts: 3, shouldRetry: isRetryableGoogleProviderError });

  if (!isRecord(body) || !Array.isArray(body.routes) || body.routes.length === 0) {
    throw new GoogleProviderError("Google Routes returned no route", false);
  }
  const firstRoute = body.routes[0];
  if (!isRecord(firstRoute)) {
    throw new GoogleProviderError("Google Routes response is malformed", false);
  }

  return normalizedRouteDataSchema.parse({
    origin: input.origin,
    destination: input.destination,
    transportMode: input.transportMode,
    departureBucket,
    durationMinutes: parseDurationMinutes(firstRoute.duration),
  });
}

export async function getGoogleRouteSnapshot(input: {
  tripId: string;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  transportMode: TransportMode;
  departureDate: string;
  departureMinute: number;
  tripTimezone: string;
  fetchImpl?: FetchLike;
  keyProvider?: KeyProvider;
}): Promise<StoredExternalSnapshot> {
  const departureBucket = routeDepartureBucket({
    date: input.departureDate,
    departureMinute: input.departureMinute,
  });
  const cacheKey = buildRouteCacheKey({
    origin: input.origin,
    destination: input.destination,
    transportMode: input.transportMode,
    departureBucket,
  });
  return getOrRefreshProviderSnapshot({
    tripId: input.tripId,
    cacheKey,
    kind: "ROUTE",
    provider: "GOOGLE_ROUTES",
    source: "GOOGLE_ROUTES_API_V2",
    ttlMs: ROUTE_TTL_MS,
    fetchData: () => fetchGoogleRouteData(input),
  });
}
