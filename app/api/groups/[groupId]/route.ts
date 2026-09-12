import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { name } = (await req.json()) as { name?: string };

  const trimmed = name?.trim();
  if (!trimmed) return NextResponse.json({ error: "Group name can't be empty" }, { status: 400 });

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  await prisma.group.update({ where: { id: groupId }, data: { name: trimmed } });
  return NextResponse.json({ ok: true, name: trimmed });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { _count: { select: { trips: true } } },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Cascades away its memberships and every trip inside it (and those trips'
  // places, suggestions, votes and rescue events). The Member rows themselves
  // survive — those are global identities that belong to other groups too.
  await prisma.group.delete({ where: { id: groupId } });

  return NextResponse.json({ ok: true, deletedTrips: group._count.trips });
}
