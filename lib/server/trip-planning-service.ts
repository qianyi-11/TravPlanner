import { applyRescueReplacement } from "@/lib/rescue";
import { buildItinerary } from "@/lib/itinerary-builder";
import { STAGE_ORDER } from "@/lib/types";
import type { ItineraryDay, TransportMode, TripRescueEvent } from "@/lib/types";
import { mapCatalogPlace } from "./mappers";
import { prisma } from "./prisma";
import { ApiError } from "./api-error";
import { requireTrip, requireTripPlaceIds } from "./authorization";
import { validateBuiltItinerary } from "../itinerary-validation";

export async function confirmTripShortlist({ tripId, placeIds }: { tripId: string; placeIds: string[] }) {
  const trip = await requireTrip(tripId);
  await requireTripPlaceIds(tripId, placeIds);

  const validationIndex = STAGE_ORDER.indexOf("validation");
  const currentIndex = STAGE_ORDER.indexOf(trip.stage as (typeof STAGE_ORDER)[number]);
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      shortlistJson: JSON.stringify(placeIds),
      stage: currentIndex > validationIndex ? trip.stage : "validation",
    },
  });

  return { ok: true as const };
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
