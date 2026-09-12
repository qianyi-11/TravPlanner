import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { mapCatalogPlace } from "@/lib/server/mappers";
import { buildItinerary } from "@/lib/itinerary-builder";
import { haversineKm } from "@/lib/geo";
import type { Place, TransportMode } from "@/lib/types";

/**
 * Orders places into a single route by real geographic proximity — a greedy
 * nearest-neighbor walk — instead of the `area` text label.
 *
 * That label is heuristically guessed for Google-imported places (a building
 * name, a floor, a street) and two spots a two-minute walk apart can easily
 * end up with different labels. Grouping by the label alone left the day
 * bouncing between the same two real-world clusters under different names —
 * exactly the "go and come back again" the schedule should avoid. Distance
 * between real coordinates doesn't have that problem: starting from the
 * top-voted place, each next stop is whichever unvisited place is physically
 * closest to the last one, so the walk only moves outward and never
 * backtracks across a cluster it already finished.
 */
function orderByProximity(places: Place[]): Place[] {
  if (places.length <= 2) return places;
  const remaining = [...places];
  const ordered: Place[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const distance = haversineKm(last.coordinates, remaining[i].coordinates);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return ordered;
}

export async function POST(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const shortlistIds = JSON.parse(trip.shortlistJson) as string[];
  if (shortlistIds.length === 0) {
    return NextResponse.json({ error: "Confirm a shortlist before building the itinerary" }, { status: 400 });
  }

  const placeRows = await prisma.place.findMany({
    where: { id: { in: shortlistIds } },
    include: { tripPlaces: { include: { suggestions: true, votes: true } } },
  });
  const placesById = new Map(placeRows.map((row) => [row.id, mapCatalogPlace(row)]));
  const orderedPlaces = shortlistIds.map((id) => placesById.get(id)).filter((p): p is Place => Boolean(p));

  const itinerary = buildItinerary(
    {
      startDate: trip.startDate,
      endDate: trip.endDate,
      dailyStart: trip.dailyStart,
      dailyEnd: trip.dailyEnd,
      transport: trip.transport as TransportMode,
    },
    orderByProximity(orderedPlaces)
  );

  await prisma.trip.update({
    where: { id: tripId },
    data: { itineraryJson: JSON.stringify(itinerary), stage: "itinerary" },
  });

  return NextResponse.json({ ok: true, days: itinerary.length });
}
