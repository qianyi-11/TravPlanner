import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  await params;
  const { memberId } = (await req.json()) as { memberId: string };

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await prisma.member.update({ where: { id: memberId }, data: { hasSubmittedSuggestions: true } });
  return NextResponse.json({ ok: true });
}
