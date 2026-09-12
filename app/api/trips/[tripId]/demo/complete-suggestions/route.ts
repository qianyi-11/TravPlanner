import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

/**
 * DEMO ONLY — stands in for the missing login/multi-user flow.
 *
 * Marks every member of the trip's group as having submitted their
 * suggestions, without inventing any suggestions for them — it just unblocks
 * the "everyone must submit before voting starts" gate so a presenter doesn't
 * have to sign in as each member to move the group forward.
 *
 * Delete this route once real auth exists.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { group: { select: { members: { select: { memberId: true } } } } },
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const memberIds = trip.group.members.map((m) => m.memberId);

  const result = await prisma.member.updateMany({
    where: { id: { in: memberIds }, hasSubmittedSuggestions: false },
    data: { hasSubmittedSuggestions: true },
  });

  return NextResponse.json({ ok: true, submittedMembers: result.count });
}
