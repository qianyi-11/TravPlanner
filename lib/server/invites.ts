import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "./api-error";
import { prisma } from "./prisma";

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createGroupInvite(groupId: string, memberId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.groupInvite.updateMany({ where: { groupId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.groupInvite.create({
      data: { groupId, tokenHash: hashInviteToken(token), createdByMemberId: memberId },
    });
  });
  return { token, path: `/join/${token}` };
}

export async function joinGroupInvite(token: string, memberId: string) {
  const invite = await prisma.groupInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { groupId: true, revokedAt: true },
  });
  if (!invite || invite.revokedAt) throw new ApiError(404, "INVITE_NOT_FOUND", "Invite link is invalid or revoked");

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_memberId: { groupId: invite.groupId, memberId } },
    select: { groupId: true },
  });
  if (existing) return { groupId: invite.groupId, alreadyMember: true as const };

  try {
    await prisma.groupMember.create({ data: { groupId: invite.groupId, memberId, role: "member" } });
  } catch (error) {
    const raced = await prisma.groupMember.findUnique({
      where: { groupId_memberId: { groupId: invite.groupId, memberId } },
      select: { groupId: true },
    });
    if (!raced) throw error;
    return { groupId: invite.groupId, alreadyMember: true as const };
  }
  return { groupId: invite.groupId, alreadyMember: false as const };
}
