import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { STAGE_ORDER } from "@/lib/types";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { requireId } from "@/lib/server/validation";

export async function POST(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const { trip } = await requireTripActor(tripId);

    const idx = STAGE_ORDER.indexOf(trip.stage as (typeof STAGE_ORDER)[number]);
    const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];

    await prisma.trip.update({ where: { id: tripId }, data: { stage: next } });
    return NextResponse.json({ ok: true, stage: next });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
