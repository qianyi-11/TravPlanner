import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { mapCatalogPlace, mapGroup, mapMember, mapTrip } from "@/lib/server/mappers";
import type { Group, Member, Place, Trip } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const [groupRows, memberRows, groupMemberRows, tripRows, placeRows] = await Promise.all([
    prisma.group.findMany({
      include: { members: { select: { memberId: true } }, trips: { select: { id: true } } },
    }),
    prisma.member.findMany(),
    prisma.groupMember.findMany(),
    prisma.trip.findMany({
      include: {
        tripPlaces: { select: { placeId: true } },
        rescueEvents: true,
        group: { select: { members: { select: { memberId: true } } } },
      },
    }),
    prisma.place.findMany({
      include: { tripPlaces: { include: { suggestions: true, votes: true } } },
    }),
  ]);

  const memberActivity = new Map<string, { suggested: string[]; voted: string[] }>();
  function activityFor(memberId: string) {
    let entry = memberActivity.get(memberId);
    if (!entry) {
      entry = { suggested: [], voted: [] };
      memberActivity.set(memberId, entry);
    }
    return entry;
  }

  const places: Record<string, Place> = {};
  for (const row of placeRows) {
    for (const tp of row.tripPlaces) {
      for (const s of tp.suggestions) activityFor(s.memberId).suggested.push(row.id);
      for (const v of tp.votes) activityFor(v.memberId).voted.push(row.id);
    }
    places[row.id] = mapCatalogPlace(row);
  }

  // A member's role can technically differ per group; prefer "organizer" if they hold it anywhere.
  const roleByMember = new Map<string, string>();
  for (const gm of groupMemberRows) {
    const existing = roleByMember.get(gm.memberId);
    if (!existing || gm.role === "organizer") roleByMember.set(gm.memberId, gm.role);
  }

  const members: Record<string, Member> = {};
  for (const row of memberRows) {
    const activity = memberActivity.get(row.id);
    members[row.id] = mapMember(row, {
      suggestedPlaceIds: activity ? Array.from(new Set(activity.suggested)) : [],
      votedPlaceIds: activity ? Array.from(new Set(activity.voted)) : [],
      role: roleByMember.get(row.id),
    });
  }

  const groups: Record<string, Group> = {};
  for (const row of groupRows) groups[row.id] = mapGroup(row);

  const trips: Record<string, Trip> = {};
  for (const row of tripRows) {
    trips[row.id] = mapTrip(
      row,
      row.group.members.map((m) => m.memberId)
    );
  }

  const currentUserId = memberRows.find((m) => m.isYou)?.id ?? memberRows[0]?.id ?? "";

  return NextResponse.json({ groups, members, trips, places, currentUserId });
}
