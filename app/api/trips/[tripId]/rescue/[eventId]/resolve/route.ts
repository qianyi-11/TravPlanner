import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { resolveTripRescue } from "@/lib/server/trip-planning-service";
import { parseJsonObject, requireId, requireItineraryRevision } from "@/lib/server/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string; eventId: string }> }
) {
  try {
    const { tripId: rawTripId, eventId: rawEventId } = await params;
    const tripId = requireId(rawTripId, "tripId");
    const eventId = requireId(rawEventId, "eventId");
    const body = await parseJsonObject(request);
    const expectedItineraryRevision = requireItineraryRevision(body.expectedItineraryRevision);
    await requireTripActor(tripId);
    return NextResponse.json(await resolveTripRescue({ tripId, eventId, expectedItineraryRevision }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
