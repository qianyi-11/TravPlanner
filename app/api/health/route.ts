import { NextResponse } from "next/server";
import { assertProductionEnv } from "@/lib/server/env";
import { prisma } from "@/lib/server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = assertProductionEnv();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, version: env.buildVersion });
  } catch {
    return NextResponse.json({ ok: false, code: "HEALTHCHECK_FAILED", error: "Service is not ready" }, { status: 503 });
  }
}
