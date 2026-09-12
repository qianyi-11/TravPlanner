import { applyRescueReplacement } from "@/lib/rescue";
import { buildItinerary } from "@/lib/itinerary-builder";
import { STAGE_ORDER } from "@/lib/types";
import type { ItineraryDay, TransportMode, TripRescueEvent } from "@/lib/types";
import { buildConsensus } from "@/lib/group-consensus";
import { mapCatalogPlace, mapMember } from "./mappers";
import { prisma } from "./prisma";
import { ApiError } from "./api-error";
import { requireTrip, requireTripPlaceIds } from "./authorization";
import { validateBuiltItinerary } from "../itinerary-validation";

export async function confirmTripShortlist({ tripId, capacity }: { tripId: string; capacity: number }) {
  const trip = await requireTrip(tripId);
  const [memberships, tripPlaces] = await Promise.all([
    prisma.groupMember.findMany({ where: { groupId: trip.groupId }, include: { member: true } }),
    prisma.tripPlace.findMany({ where: { tripId }, include: { place: true, votes: true } }),
  ]);
  const members = memberships.map(({ member, role }) => mapMember(member, { suggestedPlaceIds: [], votedPlaceIds: [], role }));
  const candidates = tripPlaces.map(({ place, votes }) => ({
    ...mapCatalogPlace(place),
    votedBy: Array.from(new Set(votes.map(({ memberId }) => memberId))),
  }));
  const shortlistPlaceIds = buildConsensus({ members, candidates, capacity }).shortlist.map(({ candidateId }) => candidateId);

  const validationIndex = STAGE_ORDER.indexOf("validation");
  const currentIndex = STAGE_ORDER.indexOf(trip.stage as (typeof STAGE_ORDER)[number]);
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      shortlistJson: JSON.stringify(shortlistPlaceIds),
      stage: currentIndex > validationIndex ? trip.stage : "validation",
    },
  });

  return { ok: true as const, shortlistPlaceIds, capacity };
}

export async function buildTripItinerary({ tripId, expectedItineraryRevision }: { tripId: string; expectedItineraryRevision: number }) {
  const trip = await requireTrip(tripId);
  if (trip.itineraryRevision !== expectedItineraryRevision) {
    throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");
  }
  let shortlistIds: string[];
  let existingItinerary: unknown;

  try {
    const shortlist = JSON.parse(trip.shortlistJson) as unknown;
    existingItinerary = JSON.parse(trip.itineraryJson) as unknown;
    if (!Array.isArray(shortlist) || !shortlist.every((id) => typeof id === "string" && id.length > 0)) throw new Error();
    shortlistIds = [...new Set(shortlist as string[])];
    if (!Array.isArray(existingItinerary)) throw new Error();
  } catch {
    throw new ApiError(409, "INVALID_SAVED_TRIP_DATA", "Saved trip planning data is invalid");
  }

  if (!shortlistIds.length) throw new ApiError(400, "SHORTLIST_REQUIRED", "Confirm a shortlist before building the itinerary");
  if ((existingItinerary as unknown[]).length) throw new ApiError(409, "ITINERARY_EXISTS", "This trip already has an itinerary");

  await requireTripPlaceIds(tripId, shortlistIds);
  const rows = await prisma.tripPlace.findMany({
    where: { tripId, placeId: { in: shortlistIds } },
    include: {
      place: { include: { tripPlaces: { include: { suggestions: true, votes: true } } } },
    },
  });
  const places = rows.map(({ place }) => mapCatalogPlace(place));
  const foundIds = new Set(places.map(({ id }) => id));
  const missingIds = shortlistIds.filter((id) => !foundIds.has(id));
  if (missingIds.length) {
    throw new ApiError(409, "SELECTED_PLACES_MISSING", `Selected places are missing: ${missingIds.join(", ")}`);
  }

  const result = buildItinerary({
    trip: {
      startDate: trip.startDate,
      endDate: trip.endDate,
      dailyStart: trip.dailyStart,
      dailyEnd: trip.dailyEnd,
      transport: trip.transport as TransportMode,
    },
    selectedPlaceIds: shortlistIds,
    places,
  });
  if (result.unscheduledPlaceIds.length) {
    throw new ApiError(
      422,
      "ITINERARY_OVERFLOW",
      `Could not fit ${result.unscheduledPlaceIds.length} selected place(s). Remove stops or extend the trip hours.`
    );
  }
  const validation = validateBuiltItinerary({ trip, shortlistPlaceIds: shortlistIds, itinerary: result.itinerary });
  if (!validation.valid) throw new ApiError(409, "ITINERARY_INVALID", "Generated itinerary is invalid", validation.reasons);

  const updated = await prisma.trip.updateMany({
    where: { id: tripId, itineraryRevision: expectedItineraryRevision },
    data: { itineraryJson: JSON.stringify(result.itinerary), stage: "itinerary", itineraryRevision: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");

  return {
    ok: true as const,
    days: result.itinerary.length,
    activities: result.itinerary.reduce((count, day) => count + day.activities.length, 0),
    itineraryRevision: expectedItineraryRevision + 1,
  };
}

function isSavedItinerary(value: unknown): value is ItineraryDay[] {
  return Array.isArray(value) && value.every((day) => {
    if (typeof day !== "object" || day === null || !Array.isArray((day as { activities?: unknown }).activities)) return false;
    return (day as { activities: unknown[] }).activities.every((activity) => {
      if (typeof activity !== "object" || activity === null) return false;
      const item = activity as { id?: unknown; type?: unknown; placeId?: unknown; backupPlaceId?: unknown };
      return typeof item.id === "string" && typeof item.type === "string" &&
        (item.placeId === null || typeof item.placeId === "string") &&
        (!Object.prototype.hasOwnProperty.call(item, "backupPlaceId") || item.backupPlaceId === null || typeof item.backupPlaceId === "string");
    });
  });
}

function parseSavedItinerary(value: string): ItineraryDay[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isSavedItinerary(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(409, "INVALID_ITINERARY_DATA", "Saved itinerary data is invalid");
  }
}

function activityFromItinerary(itinerary: ItineraryDay[], activityId: string) {
  return itinerary.flatMap((day) => day.activities).find((activity) => activity.id === activityId);
}

export async function setTripActivityBackup({
  tripId,
  activityId,
  backupPlaceId,
  expectedItineraryRevision,
}: {
  tripId: string;
  activityId: string;
  backupPlaceId: string;
  expectedItineraryRevision: number;
}) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    if (trip.itineraryRevision !== expectedItineraryRevision) {
      throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");
    }

    const itinerary = parseSavedItinerary(trip.itineraryJson);
    const activity = activityFromItinerary(itinerary, activityId);
    if (!activity) throw new ApiError(409, "ACTIVITY_NOT_FOUND", "Itinerary activity not found");
    if (activity.type !== "place") throw new ApiError(409, "ACTIVITY_NOT_PLACE", "Plan B is only available for place activities");
    if (!activity.placeId) throw new ApiError(409, "PRIMARY_PLACE_MISSING", "The itinerary activity has no primary place");
    if (backupPlaceId === activity.placeId) throw new ApiError(400, "BACKUP_EQUALS_PRIMARY", "Plan B must differ from the primary place");
    const [primary, backup] = await Promise.all([
      tx.tripPlace.findUnique({ where: { tripId_placeId: { tripId, placeId: activity.placeId } }, select: { placeId: true } }),
      tx.tripPlace.findUnique({ where: { tripId_placeId: { tripId, placeId: backupPlaceId } }, select: { placeId: true } }),
    ]);
    if (!primary) throw new ApiError(409, "PRIMARY_PLACE_NOT_FOUND", "The primary place is not part of this trip");
    if (!backup) throw new ApiError(400, "BACKUP_PLACE_NOT_IN_TRIP", "Plan B must be a place saved to this trip");

    const updatedItinerary = itinerary.map((day) => ({
      ...day,
      activities: day.activities.map((item) => item.id === activityId ? { ...item, backupPlaceId } : item),
    }));
    const updated = await tx.trip.updateMany({
      where: { id: tripId, itineraryRevision: expectedItineraryRevision },
      data: { itineraryJson: JSON.stringify(updatedItinerary), itineraryRevision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");
    return { ok: true as const, itineraryRevision: expectedItineraryRevision + 1 };
  });
}

export async function removeTripActivityBackup({
  tripId,
  activityId,
  expectedItineraryRevision,
}: {
  tripId: string;
  activityId: string;
  expectedItineraryRevision: number;
}) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    if (trip.itineraryRevision !== expectedItineraryRevision) {
      throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");
    }
    const itinerary = parseSavedItinerary(trip.itineraryJson);
    const activity = activityFromItinerary(itinerary, activityId);
    if (!activity) throw new ApiError(409, "ACTIVITY_NOT_FOUND", "Itinerary activity not found");
    if (activity.type !== "place") throw new ApiError(409, "ACTIVITY_NOT_PLACE", "Plan B is only available for place activities");

    const updatedItinerary = itinerary.map((day) => ({
      ...day,
      activities: day.activities.map((item) => item.id === activityId ? { ...item, backupPlaceId: null } : item),
    }));
    const updated = await tx.trip.updateMany({
      where: { id: tripId, itineraryRevision: expectedItineraryRevision },
      data: { itineraryJson: JSON.stringify(updatedItinerary), itineraryRevision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");
    return { ok: true as const, itineraryRevision: expectedItineraryRevision + 1 };
  });
}

function isAlternative(value: unknown): value is NonNullable<TripRescueEvent["alternative"]> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { placeId?: unknown }).placeId === "string" &&
    typeof (value as { label?: unknown }).label === "string" &&
    typeof (value as { cost?: unknown }).cost === "number" &&
    Number.isFinite((value as { cost: number }).cost)
  );
}

export async function resolveTripRescue({
  tripId,
  eventId,
  expectedItineraryRevision,
}: {
  tripId: string;
  eventId: string;
  expectedItineraryRevision: number;
}) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.rescueEvent.findUnique({ where: { id: eventId } });
    if (!event || event.tripId !== tripId) throw new ApiError(404, "RESCUE_EVENT_NOT_FOUND", "Rescue event not found");
    if (event.status === "resolved") return { ok: true as const, alreadyResolved: true as const };

    const trip = await tx.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    if (trip.itineraryRevision !== expectedItineraryRevision) {
      throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");
    }

    let itinerary: ItineraryDay[];
    let alternative: NonNullable<TripRescueEvent["alternative"]> | undefined;
    try {
      const parsedItinerary = JSON.parse(trip.itineraryJson) as unknown;
      const parsedAlternative = event.alternativeJson ? (JSON.parse(event.alternativeJson) as unknown) : undefined;
      if (!Array.isArray(parsedItinerary)) throw new Error();
      itinerary = parsedItinerary as ItineraryDay[];
      alternative = isAlternative(parsedAlternative) ? parsedAlternative : undefined;
    } catch {
      throw new ApiError(409, "RESCUE_DATA_INVALID", "Rescue data is invalid");
    }

    const affectedActivity = activityFromItinerary(itinerary, event.affectedActivityId);
    if (!affectedActivity) throw new ApiError(409, "AFFECTED_ACTIVITY_NOT_FOUND", "Affected itinerary activity not found");
    if (affectedActivity.type === "place" && affectedActivity.backupPlaceId) {
      if (!affectedActivity.placeId) throw new ApiError(409, "PRIMARY_PLACE_MISSING", "The affected activity has no primary place");
      const primary = await tx.tripPlace.findUnique({
        where: { tripId_placeId: { tripId, placeId: affectedActivity.placeId } },
        select: { placeId: true },
      });
      const backup = await tx.tripPlace.findUnique({
        where: { tripId_placeId: { tripId, placeId: affectedActivity.backupPlaceId } },
        include: { place: true },
      });
      if (!primary) throw new ApiError(409, "PRIMARY_PLACE_NOT_FOUND", "The primary place is not part of this trip");
      if (!backup) throw new ApiError(409, "BACKUP_PLACE_NOT_FOUND", "Saved Plan B is not part of this trip");
      if (backup.placeId === affectedActivity.placeId) throw new ApiError(409, "BACKUP_EQUALS_PRIMARY", "Saved Plan B matches the primary place");
      alternative = {
        placeId: backup.placeId,
        label: backup.place.name,
        extraTravelMinutes: 0,
        available: backup.place.availability === "available",
        cost: Number.isFinite(affectedActivity.estimatedCost) ? affectedActivity.estimatedCost : 0,
        note: "Your saved Plan B",
      };
    }
    if (!alternative) throw new ApiError(409, "PREPARED_REPLACEMENT_MISSING", "Prepared replacement is missing");
    try {
      itinerary = applyRescueReplacement(itinerary, event.affectedActivityId, alternative);
    } catch {
      throw new ApiError(409, "AFFECTED_ACTIVITY_NOT_FOUND", "Affected itinerary activity not found");
    }

    const updatedTrip = await tx.trip.updateMany({
      where: { id: tripId, itineraryRevision: expectedItineraryRevision },
      data: { itineraryJson: JSON.stringify(itinerary), itineraryRevision: { increment: 1 } },
    });
    if (updatedTrip.count !== 1) throw new ApiError(409, "STALE_ITINERARY", "The itinerary changed. Refresh and try again.");

    const updatedEvent = await tx.rescueEvent.updateMany({
      where: { id: eventId, status: "open" },
      data: { status: "resolved" },
    });
    if (updatedEvent.count !== 1) {
      const current = await tx.rescueEvent.findUnique({ where: { id: eventId }, select: { status: true } });
      if (current?.status === "resolved") return { ok: true as const, alreadyResolved: true as const };
      throw new ApiError(409, "RESCUE_NOT_APPLIED", "Rescue could not be applied");
    }
    return { ok: true as const, itineraryRevision: expectedItineraryRevision + 1 };
  });
}
