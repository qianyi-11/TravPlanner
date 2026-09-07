import { getFirestore, type Transaction } from "firebase-admin/firestore";
import {
  candidateDocumentSchema,
  timeToMinutes,
  type CandidateDocument,
  type ItineraryDay,
  type ItineraryItem,
  type TripDocument,
} from "@travel-planner/shared";
import { authError } from "../auth";
import { getGooglePlaceDetailsSnapshot } from "../integrations/google/placeDetails";
import { getGoogleRouteSnapshot } from "../integrations/google/routes";
import type { StoredExternalSnapshot } from "../integrations/externalSnapshots";
import {
  evaluateItineraryValidation,
  loadAndEvaluateCandidateValidationInTransaction,
  resolveEffectiveDayWindow,
  type CandidateValidationOutput,
  type ItineraryRouteLegValidationInput,
  type SameDayInterval,
} from "../validation";

export type PlaceDetailsResolver = typeof getGooglePlaceDetailsSnapshot;
export type RouteResolver = typeof getGoogleRouteSnapshot;

export interface ReviewValidationPreparation {
  candidateIds: string[];
  candidateLocations: Record<string, { lat: number; lng: number }>;
  placeSnapshots: Record<string, StoredExternalSnapshot>;
  routeLegs: ItineraryRouteLegValidationInput[];
  routeSetComplete: boolean;
}

function sameLocation(left: { lat: number; lng: number }, right: { lat: number; lng: number }) {
  return left.lat === right.lat && left.lng === right.lng;
}

function itemMinutes(item: ItineraryItem) {
  const startMinute = timeToMinutes(item.startTime);
  const endMinute = timeToMinutes(item.endTime);
  if (
    startMinute === null ||
    endMinute === null ||
    startMinute >= endMinute ||
    endMinute - startMinute !== item.durationMinutes
  ) {
    throw authError("INVALID_INPUT", "Review draft contains invalid or inconsistent item timing.", {
      targetId: item.itemId,
    });
  }
  return { startMinute, endMinute };
}

function dayLocations(trip: TripDocument, date: string) {
  const override = trip.dayOverrides.find(entry => entry.date === date);
  return {
    start: override?.startLocation ?? trip.baseLocation,
    end: override?.endLocation ?? trip.baseLocation,
  };
}

export async function loadReviewCandidatesInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  days: readonly ItineraryDay[];
}): Promise<Map<string, CandidateDocument>> {
  const candidateIds = [...new Set(
    input.days.flatMap(day => day.items.flatMap(item => item.candidateId ? [item.candidateId] : [])),
  )].sort();
  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const candidates = new Map<string, CandidateDocument>();
  for (const candidateId of candidateIds) {
    const snapshot = await input.transaction.get(tripRef.collection("candidates").doc(candidateId));
    const parsed = candidateDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Review draft candidate authority is missing or malformed.", {
        tripId: input.tripId,
        targetId: candidateId,
      });
    }
    candidates.set(candidateId, parsed.data);
  }
  return candidates;
}

export async function prepareReviewValidation(input: {
  tripId: string;
  trip: TripDocument;
  days: readonly ItineraryDay[];
  candidates: ReadonlyMap<string, CandidateDocument>;
  placeDetailsResolver?: PlaceDetailsResolver;
  routeResolver?: RouteResolver;
}): Promise<ReviewValidationPreparation> {
  const placeDetailsResolver = input.placeDetailsResolver ?? getGooglePlaceDetailsSnapshot;
  const routeResolver = input.routeResolver ?? getGoogleRouteSnapshot;
  const candidateIds = [...input.candidates.keys()].sort();
  const placeSnapshots: Record<string, StoredExternalSnapshot> = {};
  const candidateLocations: Record<string, { lat: number; lng: number }> = {};

  for (const candidateId of candidateIds) {
    const candidate = input.candidates.get(candidateId)!;
    candidateLocations[candidateId] = candidate.location;
    placeSnapshots[candidateId] = await placeDetailsResolver({
      tripId: input.tripId,
      placeId: candidate.placeId,
      tripTimezone: input.trip.timezone,
      tripStartDate: input.trip.startDate,
      tripEndDate: input.trip.endDate,
    });
  }

  const routeLegs: ItineraryRouteLegValidationInput[] = [];
  let routeSetComplete = true;
  for (const day of input.days) {
    const effectiveWindow = resolveEffectiveDayWindow(day.date, input.trip);
    if (!effectiveWindow) {
      routeSetComplete = false;
      continue;
    }
    const locations = dayLocations(input.trip, day.date);
    const ordered = [...day.items].sort((a, b) => {
      const aStart = itemMinutes(a).startMinute;
      const bStart = itemMinutes(b).startMinute;
      return aStart - bStart || a.itemId.localeCompare(b.itemId);
    });
    if (ordered.length === 0) continue;

    for (let index = 0; index <= ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const next = ordered[index];
      const previousEnd = previous ? itemMinutes(previous).endMinute : effectiveWindow.startMinute;
      const nextStart = next ? itemMinutes(next).startMinute : effectiveWindow.endMinute;
      const origin = previous?.candidateId
        ? input.candidates.get(previous.candidateId)?.location
        : locations.start;
      const destination = next?.candidateId
        ? input.candidates.get(next.candidateId)?.location
        : locations.end;
      if (!origin || !destination) {
        routeSetComplete = false;
        continue;
      }
      if (sameLocation(origin, destination)) continue;
      const snapshot = await routeResolver({
        tripId: input.tripId,
        origin,
        destination,
        transportMode: input.trip.primaryTransport,
        departureDate: day.date,
        departureMinute: previousEnd,
        tripTimezone: input.trip.timezone,
      });
      routeLegs.push({
        snapshot,
        availableMinutes: Math.max(0, nextStart - previousEnd),
      });
      if (snapshot.snapshot.freshness !== "FRESH" || !snapshot.snapshot.data) {
        routeSetComplete = false;
      }
    }
  }

  return { candidateIds, candidateLocations, placeSnapshots, routeLegs, routeSetComplete };
}

export async function evaluateReviewDraftInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  trip: TripDocument;
  days: readonly ItineraryDay[];
  preparation: ReviewValidationPreparation;
  confirmedBookingIntervals: readonly SameDayInterval[];
}) {
  const candidateValidations: CandidateValidationOutput[] = [];
  const activityIntervals: SameDayInterval[] = [];

  for (const day of input.days) {
    for (const item of day.items) {
      if (!item.candidateId || item.itemId.startsWith("fixed:")) continue;
      const { startMinute, endMinute } = itemMinutes(item);
      const interval = { date: day.date, startMinute, endMinute };
      const placeDetailsSnapshot = input.preparation.placeSnapshots[item.candidateId];
      if (!placeDetailsSnapshot) {
        throw authError("CONFLICT", "Review candidate provider authority is missing.", {
          tripId: input.tripId,
          targetId: item.candidateId,
        });
      }
      const validation = await loadAndEvaluateCandidateValidationInTransaction({
        transaction: input.transaction,
        tripId: input.tripId,
        trip: input.trip,
        candidateId: item.candidateId,
        placeDetailsSnapshot,
        placement: {
          interval,
          confirmedBookingIntervals: input.confirmedBookingIntervals,
        },
      });
      candidateValidations.push(validation);
      activityIntervals.push(interval);
    }
  }

  return evaluateItineraryValidation({
    candidateValidations,
    activityIntervals,
    routeLegs: input.preparation.routeLegs,
    routeSetComplete: input.preparation.routeSetComplete,
    currency: input.trip.activityBudgetCurrency,
    safeActivityBudgetCeiling: input.trip.safeActivityBudgetCeiling,
  });
}
