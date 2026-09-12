import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { ApiError, apiErrorResponse } from "@/lib/server/api-error";
import { requireGroupOrganizer } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";

const MAX_GROUP_NAME_LENGTH = 120;

export async function PATCH(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const groupId = requireId((await params).groupId, "groupId");
    await requireGroupOrganizer(groupId);
    const body = await parseJsonObject(request);
    if (Object.keys(body).some((field) => field !== "name") || typeof body.name !== "string") {
      throw new ApiError(400, "INVALID_REQUEST", "Only a string name may be updated");
    }
    const name = body.name.trim();
    if (!name) throw new ApiError(400, "INVALID_GROUP_NAME", "Group name can't be empty");
    if (name.length > MAX_GROUP_NAME_LENGTH) {
      throw new ApiError(400, "INVALID_GROUP_NAME", `Group name must be at most ${MAX_GROUP_NAME_LENGTH} characters`);
    }
    await prisma.group.update({ where: { id: groupId }, data: { name } });
    return NextResponse.json({ ok: true, name });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const groupId = requireId((await params).groupId, "groupId");
    await requireGroupOrganizer(groupId);
    const group = await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { _count: { select: { trips: true } } },
    });
    await prisma.group.delete({ where: { id: groupId } });
    return NextResponse.json({ ok: true, deletedTrips: group._count.trips });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
