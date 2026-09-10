import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { applyRescueReplacement } from "@/lib/rescue";
import type { ItineraryDay, TripRescueEvent } from "@/lib/types";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ tripId: string; eventId: string }> }
) {
  const { tripId, eventId } = await params;

  const event = await prisma.rescueEvent.findUnique({ where: { id: eventId } });
  if (!event || event.tripId !== tripId) {
    return NextResponse.json({ error: "Rescue event not found" }, { status: 404 });
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { itineraryJson: true } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  let itinerary: ItineraryDay[];
  let alternative: TripRescueEvent["alternative"];
  try {
    itinerary = JSON.parse(trip.itineraryJson) as ItineraryDay[];
    alternative = event.alternativeJson ? JSON.parse(event.alternativeJson) : undefined;
  } catch {
    return NextResponse.json({ error: "Rescue data is invalid" }, { status: 409 });
  }
  if (
    !alternative ||
    typeof alternative.placeId !== "string" ||
    typeof alternative.label !== "string" ||
    typeof alternative.cost !== "number" ||
    !Number.isFinite(alternative.cost)
  ) {
    return NextResponse.json({ error: "Prepared replacement is missing" }, { status: 409 });
  }

  try {
    itinerary = applyRescueReplacement(itinerary, event.affectedActivityId, alternative);
  } catch {
    return NextResponse.json({ error: "Affected itinerary activity not found" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.trip.update({ where: { id: tripId }, data: { itineraryJson: JSON.stringify(itinerary) } }),
    prisma.rescueEvent.update({ where: { id: eventId }, data: { status: "resolved" } }),
  ]);
  return NextResponse.json({ ok: true });
}
