import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { parseJsonObject, parseMemberPreferences, requireId } from "@/lib/server/validation";
import { requireAuthenticatedActor } from "@/lib/server/auth";

export async function POST(req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const memberId = requireId((await params).memberId, "memberId");
    const actor = await requireAuthenticatedActor();
    if (actor.memberId !== memberId) throw new ApiError(403, "ACTOR_MISMATCH", "You can only update your own preferences");
    const preferences = parseMemberPreferences((await parseJsonObject(req)).preferences);
    await prisma.member.update({
      where: { id: memberId },
      data: { preferencesJson: JSON.stringify(preferences) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
