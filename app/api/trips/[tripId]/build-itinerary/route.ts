import { NextResponse } from "next/server";
import { buildItinerary } from "@/lib/itinerary-builder";
import { mapCatalogPlace } from "@/lib/server/mappers";
import { prisma } from "@/lib/server/prisma";
import type { TransportMode } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  let shortlistIds: string[];
  let existingItinerary: unknown;
  try {
    const shortlist = JSON.parse(trip.shortlistJson) as unknown;
    existingItinerary = JSON.parse(trip.itineraryJson) as unknown;
    if (!Array.isArray(shortlist) || !shortlist.every((id) => typeof id === "string" && id.length > 0)) throw new Error();
    shortlistIds = [...new Set(shortlist)];
    if (!Array.isArray(existingItinerary)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Saved trip planning data is invalid" }, { status: 409 });
  }

  if (!shortlistIds.length) {
    return NextResponse.json({ error: "Confirm a shortlist before building the itinerary" }, { status: 400 });
  }
  if (existingItinerary.length) {
    return NextResponse.json({ error: "This trip already has an itinerary" }, { status: 409 });
  }

  const rows = await prisma.place.findMany({
    where: { id: { in: shortlistIds } },
    include: { tripPlaces: { include: { suggestions: true, votes: true } } },
  });
  const places = rows.map(mapCatalogPlace);
  const foundIds = new Set(places.map(({ id }) => id));
  const missingIds = shortlistIds.filter((id) => !foundIds.has(id));
  if (missingIds.length) {
    return NextResponse.json({ error: `Selected places are missing: ${missingIds.join(", ")}` }, { status: 409 });
  }

  const result = buildItinerary({
    trip: {
      startDate: trip.startDate,
      endDate: trip.endDate,
      dailyStart: trip.dailyStart,
      dailyEnd: trip.dailyEnd,
      transport: trip.transport as TransportMode,
    },
    selectedPlaceIds: shortlistIds,
    places,
  });
  if (result.unscheduledPlaceIds.length) {
    return NextResponse.json(
      { error: `Could not fit ${result.unscheduledPlaceIds.length} selected place(s). Remove stops or extend the trip hours.` },
      { status: 422 }
    );
  }

  await prisma.trip.update({
    where: { id: tripId },
    data: { itineraryJson: JSON.stringify(result.itinerary), stage: "itinerary" },
  });

  return NextResponse.json({
    ok: true,
    days: result.itinerary.length,
    activities: result.itinerary.reduce((count, day) => count + day.activities.length, 0),
  });
}
