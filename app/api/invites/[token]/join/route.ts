import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireAuthenticatedActor } from "@/lib/server/auth";
import { joinGroupInvite } from "@/lib/server/invites";
import { requireId } from "@/lib/server/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = requireId((await params).token, "token");
    const { memberId } = await requireAuthenticatedActor();
    return NextResponse.json(await joinGroupInvite(token, memberId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
