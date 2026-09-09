import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import type { MemberPreferences } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const { preferences } = (await req.json()) as { preferences: MemberPreferences };

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await prisma.member.update({
    where: { id: memberId },
    data: { preferencesJson: JSON.stringify(preferences) },
  });

  return NextResponse.json({ ok: true });
}
