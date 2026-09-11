import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { buildTripItinerary } from "@/lib/server/trip-planning-service";
import { parseJsonObject, requireId, requireItineraryRevision } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(request);
    const expectedItineraryRevision = requireItineraryRevision(body.expectedItineraryRevision);
    await requireTripActor(tripId);
    return NextResponse.json(await buildTripItinerary({ tripId, expectedItineraryRevision }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
