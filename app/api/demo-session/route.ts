import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { DEMO_AUTH_COOKIE, getDemoMemberId, isDemoAuthEnabled } from "@/lib/server/demo-auth";
import { getServerEnv } from "@/lib/server/env";

export async function GET() {
  const enabled = isDemoAuthEnabled();
  if (!enabled) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ enabled });
}

export async function POST() {
  if (!isDemoAuthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const memberId = getDemoMemberId();
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!member) {
    return NextResponse.json({ error: "Competition demo is unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_AUTH_COOKIE, member.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: getServerEnv().nodeEnv === "production",
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
    secure: getServerEnv().nodeEnv === "production",
  });
  return response;
}
