import { prisma } from "./prisma";
import { ApiError } from "./api-error";

export async function requireTrip(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
  return trip;
}

export async function requireTripMember(tripId: string, memberId: string) {
  const trip = await requireTrip(tripId);
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_memberId: { groupId: trip.groupId, memberId } },
  });
  if (!membership) throw new ApiError(403, "MEMBER_NOT_IN_TRIP", "Member is not part of this trip");
  return trip;
}

export async function requireTripPlace(tripId: string, placeId: string) {
  const tripPlace = await prisma.tripPlace.findUnique({
    where: { tripId_placeId: { tripId, placeId } },
  });
  if (!tripPlace) throw new ApiError(400, "PLACE_NOT_IN_TRIP", "This place isn't part of the trip yet");
  return tripPlace;
}

export async function requireTripPlaceIds(tripId: string, placeIds: string[]) {
  const rows = await prisma.tripPlace.findMany({
    where: { tripId, placeId: { in: placeIds } },
    select: { placeId: true },
  });
  const found = new Set(rows.map(({ placeId }) => placeId));
  const missing = placeIds.filter((placeId) => !found.has(placeId));
  if (missing.length) {
    throw new ApiError(400, "PLACE_NOT_IN_TRIP", "Selected places must belong to this trip", { placeIds: missing });
  }
  return rows;
}

export async function requireRescueEventForTrip(tripId: string, eventId: string) {
  const event = await prisma.rescueEvent.findUnique({ where: { id: eventId } });
  if (!event || event.tripId !== tripId) throw new ApiError(404, "RESCUE_EVENT_NOT_FOUND", "Rescue event not found");
  return event;
}
