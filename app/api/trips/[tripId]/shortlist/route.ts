import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { STAGE_ORDER } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { placeIds } = (await req.json()) as { placeIds: string[] };

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const validationIndex = STAGE_ORDER.indexOf("validation");
  const currentIndex = STAGE_ORDER.indexOf(trip.stage as (typeof STAGE_ORDER)[number]);
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      shortlistJson: JSON.stringify(placeIds),
      stage: currentIndex > validationIndex ? trip.stage : "validation",
    },
  });

  return NextResponse.json({ ok: true });
}
