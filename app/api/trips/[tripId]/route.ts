import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // Cascades away its TripPlaces (and their Suggestions/Votes) and RescueEvents.
  await prisma.trip.delete({ where: { id: tripId } });

  return NextResponse.json({ ok: true });
}
