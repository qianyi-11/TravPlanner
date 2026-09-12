import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { newId } from "@/lib/server/ids";

export async function POST(req: Request) {
  const body = await req.json();
  const { name, emoji, description, coverColor } = body as {
    name: string;
    emoji: string;
    description?: string;
    coverColor: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }

  // "You" is a single global identity shared across every group — reuse it if it
  // already exists (from an earlier group/trip), otherwise create it now.
  let you = await prisma.member.findFirst({ where: { isYou: true } });
  if (!you) {
    you = await prisma.member.create({
      data: { id: newId("mem"), name: "You", initials: "Y", avatarColor: "#E15A2A", isYou: true },
    });
  }

  const id = newId("grp");
  await prisma.group.create({
    data: {
      id,
      name: name.trim(),
      emoji,
      coverColor,
      description: description?.trim() || null,
      members: {
        create: { memberId: you.id, role: "organizer" },
      },
    },
  });

  return NextResponse.json({ id });
}
