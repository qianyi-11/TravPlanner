import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { DEMO_AUTH_COOKIE, isDemoAuthEnabled } from "@/lib/server/demo-auth";

export async function POST(req: Request) {
  if (!isDemoAuthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
  }

  const memberId = (body as { memberId?: unknown })?.memberId;
  if (typeof memberId !== "string" || !memberId.trim()) {
    return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_AUTH_COOKIE, member.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  if (!isDemoAuthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
