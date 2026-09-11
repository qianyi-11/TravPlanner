import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripMember } from "@/lib/server/authorization";
import { resolveTripRescue } from "@/lib/server/trip-planning-service";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string; eventId: string }> }
) {
  try {
    const { tripId: rawTripId, eventId: rawEventId } = await params;
    const tripId = requireId(rawTripId, "tripId");
    const eventId = requireId(rawEventId, "eventId");
    const body = await parseJsonObject(request);
    const memberId = requireId(body.memberId, "memberId");
    await requireTripMember(tripId, memberId);
    return NextResponse.json(await resolveTripRescue({ tripId, eventId }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
