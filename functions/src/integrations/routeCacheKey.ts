import {
  normalizedRouteDepartureBucketSchema,
  type NormalizedRouteDepartureBucket,
  type TransportMode,
} from "@travel-planner/shared";

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

function canonicalCoordinate(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Route coordinates must be finite");
  return Object.is(value, -0) ? 0 : value;
}

export function routeDepartureBucket(input: {
  date: string;
  departureMinute: number;
}): NormalizedRouteDepartureBucket {
  if (!Number.isInteger(input.departureMinute) || input.departureMinute < 0 || input.departureMinute > 1439) {
    throw new RangeError("departureMinute must be an integer from 0 to 1439");
  }
  return normalizedRouteDepartureBucketSchema.parse({
    date: input.date,
    startMinute: Math.floor(input.departureMinute / 15) * 15,
  });
}

export function buildRouteCacheKey(input: {
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  transportMode: TransportMode;
  departureBucket: NormalizedRouteDepartureBucket;
}): string {
  const bucket = normalizedRouteDepartureBucketSchema.parse(input.departureBucket);
  return JSON.stringify([
    "ROUTE",
    canonicalCoordinate(input.origin.lat),
    canonicalCoordinate(input.origin.lng),
    canonicalCoordinate(input.destination.lat),
    canonicalCoordinate(input.destination.lng),
    input.transportMode,
    bucket.date,
    bucket.startMinute,
  ]);
}
