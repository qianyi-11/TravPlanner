import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { STAGE_ORDER } from "@/lib/types";

export async function POST(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const idx = STAGE_ORDER.indexOf(trip.stage as (typeof STAGE_ORDER)[number]);
  const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];

  await prisma.trip.update({ where: { id: tripId }, data: { stage: next } });
  return NextResponse.json({ ok: true, stage: next });
}
