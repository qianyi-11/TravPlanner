import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { confirmTripShortlist } from "@/lib/server/trip-planning-service";
import { parseJsonObject, requireId, requireUniqueIdArray } from "@/lib/server/validation";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(req);
    const placeIds = requireUniqueIdArray(body.placeIds, "placeIds", { min: 1, max: 100 });
    await requireTripActor(tripId);
    return NextResponse.json(await confirmTripShortlist({ tripId, placeIds }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
