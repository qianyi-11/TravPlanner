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
    if (typeof body.voted !== "boolean") throw new ApiError(400, "INVALID_REQUEST", "voted must be a boolean");
    const voted = body.voted;
    const { memberId, trip } = await requireTripActor(tripId);
    const tripPlace = await requireTripPlace(tripId, placeId);

    await prisma.$transaction(async (tx) => {
      const existingVote = await tx.vote.findUnique({
        where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId } },
      });

      if (!voted) {
        if (existingVote) await tx.vote.delete({ where: { id: existingVote.id } });
        return;
      }
      if (existingVote) return;

      const votesInTrip = await tx.vote.count({ where: { memberId, tripPlace: { tripId } } });
      if (votesInTrip >= trip.votesPerMember) {
        throw new ApiError(400, "VOTE_LIMIT_REACHED", `You can only vote for up to ${trip.votesPerMember} places.`);
      }
      await tx.vote.create({ data: { tripPlaceId: tripPlace.id, memberId } });
    });

    return NextResponse.json({ ok: true, voted });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
