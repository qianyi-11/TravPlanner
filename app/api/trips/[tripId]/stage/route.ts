import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { STAGE_ORDER, type PlanningStage } from "@/lib/types";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const { stage } = await parseJsonObject(req) as { stage?: PlanningStage };

    if (!stage || !STAGE_ORDER.includes(stage)) throw new ApiError(400, "INVALID_STAGE", "Invalid stage");
    await requireTripActor(tripId);

    await prisma.trip.update({ where: { id: tripId }, data: { stage } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
