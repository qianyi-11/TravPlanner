import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { placeId, memberId } = (await req.json()) as { placeId: string; memberId: string };

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const tripPlace = await prisma.tripPlace.findUnique({
    where: { tripId_placeId: { tripId, placeId } },
  });
  if (!tripPlace) {
    return NextResponse.json({ error: "This place isn't part of the trip yet" }, { status: 400 });
  }

  const existingVote = await prisma.vote.findUnique({
    where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId } },
  });

  if (existingVote) {
    await prisma.vote.delete({ where: { id: existingVote.id } });
    return NextResponse.json({ ok: true, voted: false });
  }

  const votesInTrip = await prisma.vote.count({ where: { memberId, tripPlace: { tripId } } });
  if (votesInTrip >= trip.votesPerMember) {
    return NextResponse.json(
      { error: `You can only vote for up to ${trip.votesPerMember} places.` },
      { status: 400 }
    );
  }

  await prisma.vote.create({ data: { tripPlaceId: tripPlace.id, memberId } });
  return NextResponse.json({ ok: true, voted: true });
}
