import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ tripId: string; eventId: string }> }
) {
  const { tripId, eventId } = await params;

  const event = await prisma.rescueEvent.findUnique({ where: { id: eventId } });
  if (!event || event.tripId !== tripId) {
    return NextResponse.json({ error: "Rescue event not found" }, { status: 404 });
  }

  await prisma.rescueEvent.update({ where: { id: eventId }, data: { status: "resolved" } });
  return NextResponse.json({ ok: true });
}
