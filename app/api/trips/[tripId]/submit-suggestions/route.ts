import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await parseJsonObject(req);
    const { memberId, trip } = await requireTripActor(tripId);
    await prisma.$transaction(async (tx) => {
      await tx.tripMemberProgress.upsert({
        where: { tripId_memberId: { tripId, memberId } },
        create: { tripId, memberId, submittedSuggestions: true },
        update: { submittedSuggestions: true },
      });
      if (trip.stage !== "ideas") return;

      const memberCount = await tx.groupMember.count({ where: { groupId: trip.groupId } });
      const submittedCount = await tx.tripMemberProgress.count({ where: { tripId, submittedSuggestions: true } });
      if (memberCount > 0 && submittedCount >= memberCount) {
        await tx.trip.update({ where: { id: tripId }, data: { stage: "preferences" } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
