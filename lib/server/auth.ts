import { cookies } from "next/headers";
import { auth } from "@/auth";
import { ApiError } from "./api-error";
import { DEMO_AUTH_COOKIE, isDemoAuthEnabled } from "./demo-auth";
import { prisma } from "./prisma";

export interface AuthenticatedActor {
  memberId: string;
}

let testMemberId: string | null | undefined;

export function setAuthenticatedMemberIdForTests(memberId: string | null) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test actor override is only available in tests");
  testMemberId = memberId;
}

export async function resolveCurrentMemberId(): Promise<string | undefined> {
  if (process.env.NODE_ENV === "test" && testMemberId !== undefined) return testMemberId ?? undefined;

  const sessionMemberId = (await auth())?.user?.memberId;
  if (sessionMemberId) return sessionMemberId;
  if (!isDemoAuthEnabled()) return undefined;

  const selectedMemberId = (await cookies()).get(DEMO_AUTH_COOKIE)?.value;
  if (selectedMemberId) return selectedMemberId;
  return (await prisma.member.findFirst({ where: { isYou: true }, select: { id: true } }))?.id;
}

export async function requireAuthenticatedActor(): Promise<AuthenticatedActor> {
  const memberId = await resolveCurrentMemberId();
  if (!memberId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!member) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
  return { memberId: member.id };
}
