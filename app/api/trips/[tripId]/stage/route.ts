import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { STAGE_ORDER, type PlanningStage } from "@/lib/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { stage } = (await req.json()) as { stage: PlanningStage };

  if (!STAGE_ORDER.includes(stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  await prisma.trip.update({ where: { id: tripId }, data: { stage } });
  return NextResponse.json({ ok: true });
}
