import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { requireTripActor, requireTripPlace } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(req);
    const placeId = requireId(body.placeId, "placeId");
    const { memberId, trip } = await requireTripActor(tripId);
    const tripPlace = await requireTripPlace(tripId, placeId);

    const existingVote = await prisma.vote.findUnique({
      where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId } },
    });

    if (existingVote) {
      await prisma.vote.delete({ where: { id: existingVote.id } });
      return NextResponse.json({ ok: true, voted: false });
    }

    const votesInTrip = await prisma.vote.count({ where: { memberId, tripPlace: { tripId } } });
    if (votesInTrip >= trip.votesPerMember) {
      throw new ApiError(400, "VOTE_LIMIT_REACHED", `You can only vote for up to ${trip.votesPerMember} places.`);
    }

    await prisma.vote.create({ data: { tripPlaceId: tripPlace.id, memberId } });
    return NextResponse.json({ ok: true, voted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
