import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { newId } from "@/lib/server/ids";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireAuthenticatedActor } from "@/lib/server/auth";

export async function POST(req: Request) {
  try {
    const { memberId } = await requireAuthenticatedActor();
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

    const id = newId("grp");
    await prisma.group.create({
      data: {
        id,
        name: name.trim(),
        emoji,
        coverColor,
        description: description?.trim() || null,
        members: {
          create: { memberId, role: "organizer" },
        },
      },
    });

    return NextResponse.json({ id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
