import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripMember } from "@/lib/server/authorization";
import { buildTripItinerary } from "@/lib/server/trip-planning-service";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(request);
    const memberId = requireId(body.memberId, "memberId");
    await requireTripMember(tripId, memberId);
    return NextResponse.json(await buildTripItinerary({ tripId }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
