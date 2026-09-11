import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { parseJsonObject, parseMemberPreferences, requireId } from "@/lib/server/validation";

export async function POST(req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const memberId = requireId((await params).memberId, "memberId");
    const preferences = parseMemberPreferences((await parseJsonObject(req)).preferences);
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
    await prisma.member.update({
      where: { id: memberId },
      data: { preferencesJson: JSON.stringify(preferences) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
