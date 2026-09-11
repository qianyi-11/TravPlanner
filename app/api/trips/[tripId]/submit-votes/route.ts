import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await parseJsonObject(req);
    const { memberId } = await requireTripActor(tripId);
    await prisma.member.update({ where: { id: memberId }, data: { hasSubmittedVotes: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
