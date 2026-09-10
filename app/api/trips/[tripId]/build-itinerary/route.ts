import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { mapCatalogPlace } from "@/lib/server/mappers";
import { buildItinerary } from "@/lib/itinerary-builder";
import type { Place, TransportMode } from "@/lib/types";

/** Groups places by area, preserving the order areas first appear in — the
 * same "nearby stops cluster together" logic the route page displays. */
function groupByArea(places: Place[]): Place[] {
  const byArea = new Map<string, Place[]>();
  for (const p of places) {
    const key = `${p.area}·${p.destination}`;
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(p);
  }
  return Array.from(byArea.values()).flat();
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
    groupByArea(orderedPlaces)
  );

  await prisma.trip.update({
    where: { id: tripId },
    data: { itineraryJson: JSON.stringify(itinerary), stage: "itinerary" },
  });

  return NextResponse.json({ ok: true, days: itinerary.length });
}
