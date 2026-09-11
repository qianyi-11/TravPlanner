import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { newId } from "@/lib/server/ids";

const COLORS = ["#D8674A", "#3E7C7B", "#8A5CF6", "#C2578B", "#4C7BD9", "#D8A62B"];

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { name } = (await req.json()) as { name: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        id: newId("mem"),
        name: name.trim(),
        initials: name.trim().slice(0, 1).toUpperCase() || "?",
        avatarColor: color,
      },
    });
    await tx.groupMember.create({ data: { groupId, memberId: created.id, role: "member" } });
    return created;
  });

  return NextResponse.json({ id: member.id });
}
