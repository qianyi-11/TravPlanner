import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { removeTripActivityBackup, setTripActivityBackup } from "@/lib/server/trip-planning-service";
import { parseJsonObject, requireId, requireItineraryRevision } from "@/lib/server/validation";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tripId: string; activityId: string }> }
) {
  try {
    const { tripId: rawTripId, activityId: rawActivityId } = await params;
    const tripId = requireId(rawTripId, "tripId");
    const activityId = requireId(rawActivityId, "activityId");
    const body = await parseJsonObject(request);
    const backupPlaceId = requireId(body.backupPlaceId, "backupPlaceId");
    const expectedItineraryRevision = requireItineraryRevision(body.expectedItineraryRevision);
    await requireTripActor(tripId);
    return NextResponse.json(await setTripActivityBackup({ tripId, activityId, backupPlaceId, expectedItineraryRevision }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tripId: string; activityId: string }> }
) {
  try {
    const { tripId: rawTripId, activityId: rawActivityId } = await params;
    const tripId = requireId(rawTripId, "tripId");
    const activityId = requireId(rawActivityId, "activityId");
    const body = await parseJsonObject(request);
    const expectedItineraryRevision = requireItineraryRevision(body.expectedItineraryRevision);
    await requireTripActor(tripId);
    return NextResponse.json(await removeTripActivityBackup({ tripId, activityId, expectedItineraryRevision }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
