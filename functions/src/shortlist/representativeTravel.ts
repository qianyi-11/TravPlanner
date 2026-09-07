import type { TripDocument } from "@travel-planner/shared";
import { getGoogleRouteSnapshot } from "../integrations/google/routes";
import { routeDepartureBucket, type RouteCoordinate } from "../integrations/routeCacheKey";
import type { StoredExternalSnapshot } from "../integrations/externalSnapshots";
import { enumerateInclusiveDateStrings } from "../validation/criticalFactScope";
import { resolveEffectiveDayWindow } from "../validation/dayWindow";

export type RouteSnapshotResolver = typeof getGoogleRouteSnapshot;

export interface RepresentativeTravelResult {
  representativeDate: string;
  representativeMinute: number;
  departureBucketStartMinute: number;
  representativeTravelMinutes?: number;
  externalSnapshotIds: string[];
}

export function representativeTravelSample(trip: Pick<TripDocument,
  "startDate" | "endDate" | "defaultDayWindow" | "dayOverrides"
>): { date: string; minute: number; departureBucketStartMinute: number } {
  const dates = enumerateInclusiveDateStrings(trip.startDate, trip.endDate);
  const date = dates[Math.floor((dates.length - 1) / 2)];
  const window = resolveEffectiveDayWindow(date, trip);
  if (!window) throw new RangeError("Representative trip date has no effective day window");
  const minute = Math.floor((window.startMinute + window.endMinute) / 2);
  const bucket = routeDepartureBucket({ date, departureMinute: minute });
  return { date, minute, departureBucketStartMinute: bucket.startMinute };
}

function freshRouteDuration(entry: StoredExternalSnapshot): number | undefined {
  const snapshot = entry.snapshot;
  if (snapshot.kind !== "ROUTE" || snapshot.provider !== "GOOGLE_ROUTES" || snapshot.freshness !== "FRESH" || !snapshot.data) {
    return undefined;
  }
  return snapshot.data.durationMinutes;
}

export async function resolveRepresentativeTravel(input: {
  tripId: string;
  trip: Pick<TripDocument,
    "startDate" | "endDate" | "defaultDayWindow" | "dayOverrides" |
    "baseLocation" | "primaryTransport" | "timezone"
  >;
  candidateLocation: RouteCoordinate;
  routeResolver?: RouteSnapshotResolver;
}): Promise<RepresentativeTravelResult> {
  const routeResolver = input.routeResolver ?? getGoogleRouteSnapshot;
  const sample = representativeTravelSample(input.trip);
  const base = { lat: input.trip.baseLocation.lat, lng: input.trip.baseLocation.lng };
  const common = {
    tripId: input.tripId,
    transportMode: input.trip.primaryTransport,
    departureDate: sample.date,
    departureMinute: sample.minute,
    tripTimezone: input.trip.timezone,
  };
  const [outbound, returning] = await Promise.allSettled([
    routeResolver({ ...common, origin: base, destination: input.candidateLocation }),
    routeResolver({ ...common, origin: input.candidateLocation, destination: base }),
  ]);
  const result: RepresentativeTravelResult = {
    representativeDate: sample.date,
    representativeMinute: sample.minute,
    departureBucketStartMinute: sample.departureBucketStartMinute,
    externalSnapshotIds: [],
  };
  if (outbound.status !== "fulfilled" || returning.status !== "fulfilled") return result;
  const outboundMinutes = freshRouteDuration(outbound.value);
  const returnMinutes = freshRouteDuration(returning.value);
  if (outboundMinutes === undefined || returnMinutes === undefined) return result;
  result.representativeTravelMinutes = Math.ceil((outboundMinutes + returnMinutes) / 2);
  result.externalSnapshotIds = [outbound.value.id, returning.value.id].sort();
  return result;
}
