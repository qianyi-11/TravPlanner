import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireGroupOrganizer } from "@/lib/server/authorization";
import { createGroupInvite } from "@/lib/server/invites";
import { requireId } from "@/lib/server/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const groupId = requireId((await params).groupId, "groupId");
    const { memberId } = await requireGroupOrganizer(groupId);
    return NextResponse.json(await createGroupInvite(groupId, memberId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
