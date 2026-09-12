import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { requireTripActor, requireTripMember } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import {
  parseJsonObject,
  requireChecklistTitle,
  requireId,
  requireOptionalAssignedMemberId,
  requireOptionalBoolean,
} from "@/lib/server/validation";

async function findItem(tripId: string, itemId: string) {
  const item = await prisma.tripChecklistItem.findFirst({ where: { id: itemId, tripId } });
  if (!item) throw new ApiError(404, "CHECKLIST_ITEM_NOT_FOUND", "Checklist item not found");
  return item;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> }
) {
  try {
    const { tripId: rawTripId, itemId: rawItemId } = await params;
    const tripId = requireId(rawTripId, "tripId");
    const itemId = requireId(rawItemId, "itemId");
    await requireTripActor(tripId);
    await findItem(tripId, itemId);
    const body = await parseJsonObject(request);
    const fields = Object.keys(body);
    if (!fields.length || fields.some((field) => !["title", "assignedMemberId", "completed"].includes(field))) {
      throw new ApiError(400, "INVALID_REQUEST", "Request contains unsupported checklist fields");
    }

    const data: { title?: string; assignedMemberId?: string | null; completed?: boolean } = {};
    if (body.title !== undefined) data.title = requireChecklistTitle(body.title);
    const assignedMemberId = requireOptionalAssignedMemberId(body.assignedMemberId);
    if (assignedMemberId !== undefined) {
      if (assignedMemberId) await requireTripMember(tripId, assignedMemberId);
      data.assignedMemberId = assignedMemberId;
    }
    const completed = requireOptionalBoolean(body.completed, "completed");
    if (completed !== undefined) data.completed = completed;

    const item = await prisma.tripChecklistItem.update({ where: { id: itemId }, data });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> }
) {
  try {
    const { tripId: rawTripId, itemId: rawItemId } = await params;
    const tripId = requireId(rawTripId, "tripId");
    const itemId = requireId(rawItemId, "itemId");
    await requireTripActor(tripId);
    await findItem(tripId, itemId);
    await prisma.tripChecklistItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
