import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { requireId } from "@/lib/server/validation";

export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await requireTripActor(tripId);

    // Cascades away its TripPlaces (and their Suggestions/Votes) and RescueEvents.
    await prisma.trip.delete({ where: { id: tripId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
