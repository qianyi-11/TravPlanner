import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

/**
 * DEMO ONLY — stands in for the missing login/multi-user flow.
 *
 * Casts plausible votes on behalf of every OTHER member who hasn't voted yet,
 * then marks them as having submitted, so a presenter doesn't have to switch
 * accounts to get past the "everyone must vote" gate.
 *
 * `excludeMemberId` — the real person at the keyboard — is never simulated
 * and never has hasSubmittedVotes forced on: this button stands in for the
 * *other* members' missing logins, not the current user's own vote. Without
 * that exclusion the button would cast random votes for whoever is using the
 * app and mark them "voted" on places they never picked.
 *
 * Members who already voted keep their own choices untouched.
 * Delete this route once real auth exists.
 */
export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { excludeMemberId } = await req.json().catch(() => ({ excludeMemberId: undefined }));

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      group: { select: { members: { select: { memberId: true } } } },
      tripPlaces: {
        include: { votes: true, place: { select: { rating: true } } },
      },
    },
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const memberIds = trip.group.members.map((m) => m.memberId).filter((id) => id !== excludeMemberId);
  const tripPlaces = trip.tripPlaces;

  if (tripPlaces.length === 0) {
    return NextResponse.json({ error: "Add some places before simulating votes" }, { status: 400 });
  }

  const votesToCreate: { tripPlaceId: string; memberId: string }[] = [];
  let simulatedMembers = 0;

  for (const memberId of memberIds) {
    const existing = tripPlaces.filter((tp) => tp.votes.some((v) => v.memberId === memberId));
    if (existing.length > 0) continue; // they voted for themselves — leave it alone

    simulatedMembers += 1;

    // Favour better-rated places so a clear ranking emerges, with enough jitter
    // that members don't all pick an identical list.
    const ranked = [...tripPlaces].sort((a, b) => {
      const scoreA = (a.place?.rating ?? 0) + Math.random() * 1.5;
      const scoreB = (b.place?.rating ?? 0) + Math.random() * 1.5;
      return scoreB - scoreA;
    });

    const cap = Math.min(trip.votesPerMember, tripPlaces.length);
    const howMany = Math.max(1, cap - Math.floor(Math.random() * 3)); // cap, cap-1 or cap-2

    for (const tp of ranked.slice(0, howMany)) {
      votesToCreate.push({ tripPlaceId: tp.id, memberId });
    }
  }

  if (votesToCreate.length > 0) {
    await prisma.vote.createMany({ data: votesToCreate });
  }

  await prisma.member.updateMany({
    where: { id: { in: memberIds } },
    data: { hasSubmittedVotes: true },
  });

  return NextResponse.json({
    ok: true,
    simulatedMembers,
    votesCast: votesToCreate.length,
    totalMembers: memberIds.length,
  });
}
