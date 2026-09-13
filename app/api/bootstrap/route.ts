import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { mapCatalogPlace, mapGroup, mapMember, mapPlaceForTrip, mapTrip } from "@/lib/server/mappers";
import type { Group, Member, Place, Trip, TripMemberProgress } from "@/lib/types";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireAuthenticatedActor } from "@/lib/server/auth";
import { isCompetitionDemoMember, isDemoAuthEnabled } from "@/lib/server/demo-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { memberId: currentUserId } = await requireAuthenticatedActor();
    const memberships = await prisma.groupMember.findMany({
      where: { memberId: currentUserId },
      select: { groupId: true },
    });
    const groupIds = Array.from(new Set(memberships.map(({ groupId }) => groupId)));

    const [groupRows, memberRows, groupMemberRows, tripRows] = await Promise.all([
      groupIds.length
        ? prisma.group.findMany({
            where: { id: { in: groupIds } },
            include: { members: { select: { memberId: true, role: true } }, trips: { select: { id: true } } },
          })
        : [],
      groupIds.length
        ? prisma.member.findMany({ where: { memberships: { some: { groupId: { in: groupIds } } } } })
        : [],
      groupIds.length
        ? prisma.groupMember.findMany({ where: { groupId: { in: groupIds } } })
        : [],
      groupIds.length
        ? prisma.trip.findMany({
            where: { groupId: { in: groupIds } },
            include: {
              tripPlaces: { select: { placeId: true } },
              rescueEvents: true,
              group: { select: { members: { select: { memberId: true } } } },
            },
          })
        : [],
    ]);

    const tripIds = tripRows.map(({ id }) => id);
    const progressRows = tripIds.length
      ? await prisma.tripMemberProgress.findMany({ where: { tripId: { in: tripIds } } })
      : [];
    const placeRows = tripIds.length
      ? await prisma.place.findMany({
          where: { tripPlaces: { some: { tripId: { in: tripIds } } } },
          include: {
            tripPlaces: {
              where: { tripId: { in: tripIds } },
              include: { suggestions: true, votes: true },
            },
          },
        })
      : [];

    const places: Record<string, Place> = {};
    const tripPlaces: Record<string, Record<string, Place>> = {};
    for (const row of placeRows) {
      for (const tripPlace of row.tripPlaces) {
        (tripPlaces[tripPlace.tripId] ??= {})[row.id] = mapPlaceForTrip(row, tripPlace);
      }
      places[row.id] = mapCatalogPlace(row);
    }

    const roleByMember = new Map<string, string>();
    for (const membership of groupMemberRows) {
      const existing = roleByMember.get(membership.memberId);
      if (!existing || membership.role === "organizer") roleByMember.set(membership.memberId, membership.role);
    }

    const members: Record<string, Member> = {};
    for (const row of memberRows) {
      members[row.id] = mapMember(row, {
        suggestedPlaceIds: [],
        votedPlaceIds: [],
        role: roleByMember.get(row.id),
      });
    }

    const groups: Record<string, Group> = {};
    for (const row of groupRows) groups[row.id] = mapGroup(row);

    const trips: Record<string, Trip> = {};
    for (const row of tripRows) {
      trips[row.id] = mapTrip(row, row.group.members.map((member) => member.memberId));
    }

    const tripMemberProgress: Record<string, Record<string, TripMemberProgress>> = {};
    for (const row of progressRows) {
      (tripMemberProgress[row.tripId] ??= {})[row.memberId] = {
        tripId: row.tripId,
        memberId: row.memberId,
        submittedSuggestions: row.submittedSuggestions,
        submittedVotes: row.submittedVotes,
      };
    }

    return NextResponse.json({
      groups,
      members,
      trips,
      places,
      tripPlaces,
      tripMemberProgress,
      currentUserId,
      demoAuthEnabled: isDemoAuthEnabled(),
      competitionDemo: isCompetitionDemoMember(currentUserId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
