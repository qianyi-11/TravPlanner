import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireTripActor, requireTripMember } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import {
  parseJsonObject,
  requireChecklistTitle,
  requireId,
  requireOptionalAssignedMemberId,
  requireOptionalBoolean,
} from "@/lib/server/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await requireTripActor(tripId);
    const items = await prisma.tripChecklistItem.findMany({
      where: { tripId },
      orderBy: [{ completed: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await requireTripActor(tripId);
    const body = await parseJsonObject(request);
    const title = requireChecklistTitle(body.title);
    const assignedMemberId = requireOptionalAssignedMemberId(body.assignedMemberId) ?? null;
    const completed = requireOptionalBoolean(body.completed, "completed") ?? false;
    if (assignedMemberId) await requireTripMember(tripId, assignedMemberId);

    const item = await prisma.tripChecklistItem.create({
      data: { id: randomUUID(), tripId, title, assignedMemberId, completed },
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
