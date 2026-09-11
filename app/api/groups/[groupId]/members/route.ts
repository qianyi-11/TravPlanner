import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { newId } from "@/lib/server/ids";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireGroupActor } from "@/lib/server/authorization";
import { requireId } from "@/lib/server/validation";

const COLORS = ["#D8674A", "#3E7C7B", "#8A5CF6", "#C2578B", "#4C7BD9", "#D8A62B"];

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const groupId = requireId((await params).groupId, "groupId");
    await requireGroupActor(groupId);
    const { name } = (await req.json()) as { name: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

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
  } catch (error) {
    return apiErrorResponse(error);
  }
}
