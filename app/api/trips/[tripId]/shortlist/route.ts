import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { placeIds } = (await req.json()) as { placeIds: string[] };

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  await prisma.trip.update({
    where: { id: tripId },
    data: { shortlistJson: JSON.stringify(placeIds), stage: "validation" },
  });

  return NextResponse.json({ ok: true });
}
