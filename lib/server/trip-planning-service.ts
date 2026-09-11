import { applyRescueReplacement } from "@/lib/rescue";
import { buildItinerary } from "@/lib/itinerary-builder";
import { STAGE_ORDER } from "@/lib/types";
import type { ItineraryDay, TransportMode, TripRescueEvent } from "@/lib/types";
import { mapCatalogPlace } from "./mappers";
import { prisma } from "./prisma";
import { ApiError } from "./api-error";
import { requireRescueEventForTrip, requireTrip, requireTripPlaceIds } from "./authorization";
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

export async function buildTripItinerary({ tripId }: { tripId: string }) {
  const trip = await requireTrip(tripId);
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

  await prisma.trip.update({
    where: { id: tripId },
    data: { itineraryJson: JSON.stringify(result.itinerary), stage: "itinerary" },
  });

  return {
    ok: true as const,
    days: result.itinerary.length,
    activities: result.itinerary.reduce((count, day) => count + day.activities.length, 0),
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

export async function resolveTripRescue({ tripId, eventId }: { tripId: string; eventId: string }) {
  const event = await requireRescueEventForTrip(tripId, eventId);
  if (event.status === "resolved") return { ok: true as const, alreadyResolved: true as const };

  const trip = await requireTrip(tripId);
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

  await prisma.$transaction([
    prisma.trip.update({ where: { id: tripId }, data: { itineraryJson: JSON.stringify(itinerary) } }),
    prisma.rescueEvent.update({ where: { id: eventId }, data: { status: "resolved" } }),
  ]);
  return { ok: true as const };
}
