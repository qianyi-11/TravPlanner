import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

const AVATAR_COLORS = ["#D8674A", "#3E7C7B", "#8A5CF6", "#C2578B", "#4C7BD9", "#D8A62B"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? "T").toUpperCase();
}

function avatarColor(seed: string) {
  const score = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_COLORS[score % AVATAR_COLORS.length];
}

export async function provisionGoogleMember(input: {
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
}) {
  const existing = await prisma.authIdentity.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: input.providerAccountId } },
    select: { memberId: true },
  });
  if (existing) return existing.memberId;

  const name = input.name?.trim() || input.email?.split("@")[0]?.trim() || "Traveller";
  try {
    return await prisma.$transaction(async (tx) => {
      const raced = await tx.authIdentity.findUnique({
        where: { provider_providerAccountId: { provider: "google", providerAccountId: input.providerAccountId } },
        select: { memberId: true },
      });
      if (raced) return raced.memberId;

      const member = await tx.member.create({
        data: {
          id: `mem-${randomUUID()}`,
          name,
          initials: initials(name),
          avatarColor: avatarColor(input.providerAccountId),
        },
        select: { id: true },
      });
      await tx.authIdentity.create({
        data: {
          memberId: member.id,
          provider: "google",
          providerAccountId: input.providerAccountId,
          email: input.email?.trim() || null,
        },
      });
      return member.id;
    });
  } catch (error) {
    const resolved = await prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: input.providerAccountId } },
      select: { memberId: true },
    });
    if (resolved) return resolved.memberId;
    throw error;
  }
}
