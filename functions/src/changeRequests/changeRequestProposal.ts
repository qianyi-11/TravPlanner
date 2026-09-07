import { getFirestore, type Transaction } from "firebase-admin/firestore";
import {
  activityBudgetReadSchema,
  candidateDocumentSchema,
  fixedBookingDocumentSchema,
  isCanonicalCurrencyCode,
  timeToMinutes,
  validateEffectiveTripSetup,
  validateMonetaryPrecision,
  type ChangeRequestChange,
  type ConfirmedBookingDocument,
  type ItineraryDay,
  type TripDocument,
} from "@travel-planner/shared";
import type { AuthoritativeMembershipState } from "../auth";
import { authError } from "../auth";
import { normalizeBookingTiming } from "../bookings/normalizeBookingTiming";
import { recalculateSafeActivityBudgetCeiling } from "../budget/recalculateSafeActivityBudgetCeiling";
import {
  getGooglePlaceDetailsSnapshot,
} from "../integrations/google/placeDetails";
import { getGoogleRouteSnapshot } from "../integrations/google/routes";
import {
  PlaceResolutionError,
  resolvePlace,
  type NormalizedPlace,
  type PlaceResolver,
} from "../integrations/google/places";
import { proposeCandidateInsertion } from "../planning/schedule";
import type { PlanningCandidate } from "../planning/types";
import {
  loadAndEvaluateCandidateValidationInTransaction,
  enumerateInclusiveDateStrings,
  type SameDayInterval,
} from "../validation";
import {
  loadReviewCandidatesInTransaction,
  prepareReviewValidation,
  type PlaceDetailsResolver,
  type ReviewValidationPreparation,
  type RouteResolver,
} from "../review/reviewValidation";
import {
  findUniqueItineraryItem,
  requireMutableActivityItem,
} from "./changeRequestDomain";

export interface ChangeRequestResolvers {
  placeDetailsResolver?: PlaceDetailsResolver;
  routeResolver?: RouteResolver;
  placeResolver?: PlaceResolver;
}

export interface BudgetMutation {
  kind: "SET" | "CLEAR";
  amount?: number;
  safeActivityBudgetCeiling?: number;
}

export interface BookingMutation {
  kind: "UPDATE" | "CANCEL";
  bookingId: string;
  updatedBooking?: ConfirmedBookingDocument;
}

export interface TransactionalChangeProposal {
  proposedTrip: TripDocument;
  proposedDays: ItineraryDay[];
  confirmedBookingIntervals: SameDayInterval[];
  budgetMutation?: BudgetMutation;
  bookingMutation?: BookingMutation;
}

export interface PreparedChangeProposal extends TransactionalChangeProposal {
  validationPreparation: ReviewValidationPreparation;
}

function cloneDays(days: readonly ItineraryDay[]): ItineraryDay[] {
  return days.map(day => ({
    ...day,
    items: day.items.map(item => ({
      ...item,
      ...(item.location ? { location: { ...item.location } } : {}),
    })),
  }));
}

function minuteToTime(minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
    throw authError("INVALID_INPUT", "Changed activity must remain inside one destination-local day.");
  }
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function moveItem(input: {
  days: ItineraryDay[];
  itemId: string;
  targetDate: string;
  targetStartTime: string;
}) {
  const found = requireMutableActivityItem(input.days, input.itemId);
  const startMinute = timeToMinutes(input.targetStartTime);
  if (startMinute === null) throw authError("INVALID_INPUT", "Changed activity start time is invalid.");
  const endTime = minuteToTime(startMinute + found.item.durationMinutes);
  const targetDayIndex = input.days.findIndex(day => day.date === input.targetDate);
  if (targetDayIndex < 0) {
    throw authError("INVALID_INPUT", "Changed activity target date is not part of the itinerary.", {
      targetId: input.targetDate,
    });
  }
  const moved = {
    ...found.item,
    date: input.targetDate,
    startTime: input.targetStartTime,
    endTime,
  };
  input.days[found.dayIndex].items.splice(found.itemIndex, 1);
  input.days[targetDayIndex].items.push(moved);
}

function changeItemTime(days: ItineraryDay[], itemId: string, targetStartTime: string) {
  const found = requireMutableActivityItem(days, itemId);
  const startMinute = timeToMinutes(targetStartTime);
  if (startMinute === null) throw authError("INVALID_INPUT", "Changed activity start time is invalid.");
  found.item.startTime = targetStartTime;
  found.item.endTime = minuteToTime(startMinute + found.item.durationMinutes);
}

function changeItemDuration(days: ItineraryDay[], itemId: string, durationMinutes: number) {
  const found = requireMutableActivityItem(days, itemId);
  const startMinute = timeToMinutes(found.item.startTime);
  if (startMinute === null) {
    throw authError("CONFLICT", "Stored itinerary activity time is malformed.", { targetId: itemId });
  }
  found.item.durationMinutes = durationMinutes;
  found.item.endTime = minuteToTime(startMinute + durationMinutes);
}

function removeActivity(days: ItineraryDay[], itemId: string) {
  const found = requireMutableActivityItem(days, itemId);
  days[found.dayIndex].items.splice(found.itemIndex, 1);
}

function sortDays(days: ItineraryDay[]) {
  days.sort((left, right) => left.date.localeCompare(right.date));
  for (const day of days) {
    day.items.sort((left, right) =>
      left.startTime.localeCompare(right.startTime) || left.itemId.localeCompare(right.itemId),
    );
  }
}

function normalizeTripDateDays(days: ItineraryDay[], trip: TripDocument): ItineraryDay[] {
  const permitted = new Set(enumerateInclusiveDateStrings(inputTripStartDate(trip), inputTripEndDate(trip)));
  for (const day of days) {
    if (!permitted.has(day.date) && day.items.length > 0) {
      throw authError(
        "VALIDATION_FAILED",
        "Trip date change would strand scheduled itinerary items outside the new trip range.",
        { targetId: day.date },
      );
    }
  }
  const byDate = new Map(days.filter(day => permitted.has(day.date)).map(day => [day.date, day]));
  return [...permitted].sort().map(date => byDate.get(date) ?? { date, items: [] });
}

function inputTripStartDate(trip: TripDocument): string {
  return trip.startDate;
}

function inputTripEndDate(trip: TripDocument): string {
  return trip.endDate;
}

async function loadConfirmedBookings(input: {
  transaction: Transaction;
  tripId: string;
  change: ChangeRequestChange;
}): Promise<{ intervals: SameDayInterval[]; mutation?: BookingMutation }> {
  const snapshots = await input.transaction.get(
    getFirestore().collection("trips").doc(input.tripId).collection("fixedBookings"),
  );
  const confirmed = new Map<string, ConfirmedBookingDocument>();
  for (const snapshot of snapshots.docs) {
    const parsed = fixedBookingDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Fixed-booking authority is malformed.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    if (parsed.data.status === "CONFIRMED") confirmed.set(snapshot.id, parsed.data);
  }

  let mutation: BookingMutation | undefined;
  if (input.change.operation === "CHANGE_FIXED_BOOKING") {
    const current = confirmed.get(input.change.bookingId);
    if (!current) {
      throw authError("NOT_FOUND", "Confirmed fixed booking was not found.", {
        tripId: input.tripId,
        targetId: input.change.bookingId,
      });
    }
    if (input.change.action === "CANCEL") {
      confirmed.delete(input.change.bookingId);
      mutation = { kind: "CANCEL", bookingId: input.change.bookingId };
    } else {
      let timing;
      try {
        timing = normalizeBookingTiming({
          startTime: input.change.startTime,
          endTime: input.change.endTime,
          durationMinutes: input.change.durationMinutes,
        });
      } catch (error) {
        throw authError("INVALID_INPUT", error instanceof Error ? error.message : "Fixed-booking timing is invalid.", {
          tripId: input.tripId,
          targetId: input.change.bookingId,
        });
      }
      const updated: ConfirmedBookingDocument = {
        ...current,
        date: input.change.date,
        startTime: timing.startTime,
        endTime: timing.endTime,
        durationMinutes: timing.durationMinutes,
      };
      confirmed.set(input.change.bookingId, updated);
      mutation = { kind: "UPDATE", bookingId: input.change.bookingId, updatedBooking: updated };
    }
  }

  const intervals = [...confirmed.values()].map(booking => {
    const startMinute = timeToMinutes(booking.startTime);
    const endMinute = timeToMinutes(booking.endTime);
    if (startMinute === null || endMinute === null || startMinute >= endMinute) {
      throw authError("CONFLICT", "Stored confirmed booking timing is malformed.", { tripId: input.tripId });
    }
    return { date: booking.date, startMinute, endMinute };
  });
  return { intervals, mutation };
}

async function calculateBudgetMutation(input: {
  transaction: Transaction;
  tripId: string;
  uid: string;
  trip: TripDocument;
  membership: AuthoritativeMembershipState;
  change: ChangeRequestChange;
}): Promise<{ ceiling?: number; mutation?: BudgetMutation }> {
  if (input.change.operation !== "CHANGE_BUDGET") {
    return { ceiling: input.trip.safeActivityBudgetCeiling };
  }
  if ("amount" in input.change) {
    if (!isCanonicalCurrencyCode(input.trip.activityBudgetCurrency)) {
      throw authError("INVALID_INPUT", "Trip currency is unsupported or non-canonical.", { tripId: input.tripId });
    }
    if (!validateMonetaryPrecision(input.change.amount, input.trip.activityBudgetCurrency)) {
      throw authError("INVALID_INPUT", "Budget amount has invalid monetary precision.", { tripId: input.tripId });
    }
  }
  const activeOwnerId = input.membership.activeOwnerId;
  if (!activeOwnerId) {
    throw authError("CONFLICT", "Activity Budget membership authority has no single ACTIVE OWNER.", {
      tripId: input.tripId,
    });
  }

  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const budgets = [] as Array<{ memberId: string; amount: number; currency: string }>;
  for (const memberId of input.membership.activeMemberIds) {
    if (memberId === input.uid) continue;
    const snapshot = await input.transaction.get(tripRef.collection("activityBudgets").doc(memberId));
    if (!snapshot.exists) continue;
    const parsed = activityBudgetReadSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Activity Budget authority is malformed.", {
        tripId: input.tripId,
        targetId: memberId,
      });
    }
    if (parsed.data.currency === input.trip.activityBudgetCurrency) {
      budgets.push({ memberId, amount: parsed.data.amount, currency: parsed.data.currency });
    }
  }
  if ("amount" in input.change) {
    budgets.push({
      memberId: input.uid,
      amount: input.change.amount,
      currency: input.trip.activityBudgetCurrency,
    });
  }
  const ceiling = recalculateSafeActivityBudgetCeiling({
    activeMemberIds: input.membership.activeMemberIds,
    activeOwnerId,
    budgets,
    currency: input.trip.activityBudgetCurrency,
  });
  return {
    ...(ceiling === undefined ? {} : { ceiling }),
    mutation: "amount" in input.change
      ? { kind: "SET", amount: input.change.amount, ...(ceiling === undefined ? {} : { safeActivityBudgetCeiling: ceiling }) }
      : { kind: "CLEAR", ...(ceiling === undefined ? {} : { safeActivityBudgetCeiling: ceiling }) },
  };
}

function applyFixedBookingDays(days: ItineraryDay[], mutation: BookingMutation | undefined) {
  if (!mutation) return;
  const found = findUniqueItineraryItem(days, `fixed:${mutation.bookingId}`);
  if (mutation.kind === "CANCEL") {
    days[found.dayIndex].items.splice(found.itemIndex, 1);
    return;
  }
  const booking = mutation.updatedBooking!;
  const targetDayIndex = days.findIndex(day => day.date === booking.date);
  if (targetDayIndex < 0) {
    throw authError("VALIDATION_FAILED", "Updated fixed booking is outside the itinerary date range.", {
      targetId: mutation.bookingId,
    });
  }
  const updated = {
    ...found.item,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    durationMinutes: booking.durationMinutes,
  };
  days[found.dayIndex].items.splice(found.itemIndex, 1);
  days[targetDayIndex].items.push(updated);
}

export async function materializeTransactionalChangeProposal(input: {
  transaction: Transaction;
  tripId: string;
  uid: string;
  trip: TripDocument;
  membership: AuthoritativeMembershipState;
  baseDays: readonly ItineraryDay[];
  change: ChangeRequestChange;
}): Promise<TransactionalChangeProposal> {
  let proposedTrip: TripDocument = { ...input.trip, dayOverrides: [...input.trip.dayOverrides] };
  let proposedDays = cloneDays(input.baseDays);

  switch (input.change.operation) {
    case "MOVE_ACTIVITY":
      moveItem({
        days: proposedDays,
        itemId: input.change.itemId,
        targetDate: input.change.targetDate,
        targetStartTime: input.change.targetStartTime,
      });
      break;
    case "CHANGE_TIME":
      changeItemTime(proposedDays, input.change.itemId, input.change.targetStartTime);
      break;
    case "CHANGE_DURATION":
      changeItemDuration(proposedDays, input.change.itemId, input.change.durationMinutes);
      break;
    case "REMOVE_ACTIVITY":
      removeActivity(proposedDays, input.change.itemId);
      break;
    case "REPLACE_ACTIVITY":
      removeActivity(proposedDays, input.change.itemId);
      break;
    case "CHANGE_TRIP_DATES":
      proposedTrip = {
        ...proposedTrip,
        startDate: input.change.startDate,
        endDate: input.change.endDate,
      };
      proposedDays = normalizeTripDateDays(proposedDays, proposedTrip);
      break;
    case "CHANGE_DAY_WINDOW":
      proposedTrip = {
        ...proposedTrip,
        defaultDayWindow: input.change.defaultDayWindow,
        dayOverrides: input.change.dayOverrides ?? proposedTrip.dayOverrides,
      };
      break;
    case "CHANGE_TRANSPORT":
      proposedTrip = { ...proposedTrip, primaryTransport: input.change.primaryTransport };
      break;
    default:
      break;
  }

  const bookings = await loadConfirmedBookings({
    transaction: input.transaction,
    tripId: input.tripId,
    change: input.change,
  });
  applyFixedBookingDays(proposedDays, bookings.mutation);

  const budget = await calculateBudgetMutation({
    transaction: input.transaction,
    tripId: input.tripId,
    uid: input.uid,
    trip: proposedTrip,
    membership: input.membership,
    change: input.change,
  });
  proposedTrip = budget.ceiling === undefined
    ? (() => {
        const { safeActivityBudgetCeiling: _ignored, ...withoutCeiling } = proposedTrip;
        return withoutCeiling as TripDocument;
      })()
    : { ...proposedTrip, safeActivityBudgetCeiling: budget.ceiling };

  sortDays(proposedDays);
  return {
    proposedTrip,
    proposedDays,
    confirmedBookingIntervals: bookings.intervals,
    ...(budget.mutation ? { budgetMutation: budget.mutation } : {}),
    ...(bookings.mutation ? { bookingMutation: bookings.mutation } : {}),
  };
}

async function resolvePlaceOrThrow(placeResolver: PlaceResolver, placeId: string): Promise<NormalizedPlace> {
  try {
    return await placeResolver(placeId);
  } catch (error) {
    if (error instanceof PlaceResolutionError) {
      throw authError(error.reason, error.reason === "NOT_FOUND" ? "Place was not found." : "Place data is unavailable.");
    }
    throw authError("EXTERNAL_DATA_UNAVAILABLE", "Place data is unavailable.");
  }
}

export async function applyExternalTripChange(input: {
  trip: TripDocument;
  change: ChangeRequestChange;
  placeResolver?: PlaceResolver;
}): Promise<TripDocument> {
  const placeResolver = input.placeResolver ?? resolvePlace;
  if (input.change.operation === "CHANGE_DESTINATION") {
    const destination = await resolvePlaceOrThrow(placeResolver, input.change.destinationPlaceId);
    return {
      ...input.trip,
      destination: {
        placeId: destination.placeId,
        name: destination.name,
        lat: destination.lat,
        lng: destination.lng,
      },
      timezone: destination.timezone,
    };
  }
  if (input.change.operation === "CHANGE_BASE_LOCATION") {
    if (input.change.baseLocation.source === "USER_CONFIRMED") {
      return { ...input.trip, baseLocation: input.change.baseLocation };
    }
    const placeId = input.change.baseLocation.placeId;
    if (!placeId) throw authError("INVALID_INPUT", "GOOGLE_PLACES base location requires placeId.");
    const base = await resolvePlaceOrThrow(placeResolver, placeId);
    return {
      ...input.trip,
      baseLocation: {
        placeId: base.placeId,
        name: base.name,
        lat: base.lat,
        lng: base.lng,
        source: "GOOGLE_PLACES",
      },
    };
  }
  return input.trip;
}

async function planningCandidateForChange(input: {
  tripId: string;
  trip: TripDocument;
  candidateId: string;
  placeDetailsResolver?: PlaceDetailsResolver;
}): Promise<PlanningCandidate> {
  const placeDetailsResolver = input.placeDetailsResolver ?? getGooglePlaceDetailsSnapshot;
  const candidateSnapshot = await getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("candidates")
    .doc(input.candidateId)
    .get();
  const candidate = candidateDocumentSchema.safeParse(candidateSnapshot.data());
  if (!candidate.success || !candidate.data.active) {
    throw authError("CANDIDATE_INACTIVE", "Change Request candidate is unavailable.", {
      tripId: input.tripId,
      targetId: input.candidateId,
    });
  }
  const placeSnapshot = await placeDetailsResolver({
    tripId: input.tripId,
    placeId: candidate.data.placeId,
    tripTimezone: input.trip.timezone,
    tripStartDate: input.trip.startDate,
    tripEndDate: input.trip.endDate,
  });
  const authority = await getFirestore().runTransaction(transaction =>
    loadAndEvaluateCandidateValidationInTransaction({
      transaction,
      tripId: input.tripId,
      trip: input.trip,
      candidateId: input.candidateId,
      placeDetailsSnapshot: placeSnapshot,
    }),
  );
  if (authority.expectedDuration.kind === "MISSING") {
    throw authError("NO_FEASIBLE_OPTIONS", "Candidate has no authoritative duration for deterministic placement.", {
      tripId: input.tripId,
      targetId: input.candidateId,
    });
  }
  if (authority.authoritativeVisitWindows.length === 0) {
    throw authError("NO_FEASIBLE_OPTIONS", "Candidate has no authoritative visit window for deterministic placement.", {
      tripId: input.tripId,
      targetId: input.candidateId,
    });
  }
  return {
    candidateId: input.candidateId,
    title: candidate.data.name,
    location: {
      ...candidate.data.location,
      name: candidate.data.name,
    },
    durationMinutes: authority.expectedDuration.durationMinutes,
    mustDo: false,
    priorityIndex: 0,
    votePreference: 0,
    authoritativeVisitWindows: authority.authoritativeVisitWindows,
    ...(authority.knownPrice ? { knownPrice: authority.knownPrice.amount } : {}),
  };
}

export async function applyPlanningChange(input: {
  tripId: string;
  trip: TripDocument;
  days: readonly ItineraryDay[];
  change: ChangeRequestChange;
  resolvers?: ChangeRequestResolvers;
}): Promise<ItineraryDay[]> {
  if (input.change.operation !== "ADD_ACTIVITY" && input.change.operation !== "REPLACE_ACTIVITY") {
    return cloneDays(input.days);
  }
  const candidateId = input.change.operation === "ADD_ACTIVITY"
    ? input.change.candidateId
    : input.change.replacementCandidateId;
  const candidate = await planningCandidateForChange({
    tripId: input.tripId,
    trip: input.trip,
    candidateId,
    placeDetailsResolver: input.resolvers?.placeDetailsResolver,
  });
  const proposed = await proposeCandidateInsertion({
    tripId: input.tripId,
    trip: input.trip,
    existingDays: input.days,
    candidate,
    ...(input.change.operation === "ADD_ACTIVITY" && input.change.targetDate
      ? { targetDate: input.change.targetDate }
      : {}),
    ...(input.resolvers?.routeResolver ? { routeResolver: input.resolvers.routeResolver } : {}),
  });
  if (!proposed) {
    throw authError("NO_FEASIBLE_OPTIONS", "No deterministic feasible slot exists for the requested activity.", {
      tripId: input.tripId,
      targetId: candidateId,
    });
  }
  return proposed;
}

export async function prepareFullChangeValidation(input: {
  tripId: string;
  trip: TripDocument;
  days: readonly ItineraryDay[];
  resolvers?: ChangeRequestResolvers;
}): Promise<ReviewValidationPreparation> {
  if (!validateEffectiveTripSetup(input.trip)) {
    throw authError("VALIDATION_FAILED", "Change Request produces an invalid effective trip setup.", {
      tripId: input.tripId,
    });
  }
  const candidateMap = await getFirestore().runTransaction(transaction =>
    loadReviewCandidatesInTransaction({
      transaction,
      tripId: input.tripId,
      days: input.days,
    }),
  );
  return prepareReviewValidation({
    tripId: input.tripId,
    trip: input.trip,
    days: input.days,
    candidates: candidateMap,
    ...(input.resolvers?.placeDetailsResolver
      ? { placeDetailsResolver: input.resolvers.placeDetailsResolver }
      : {}),
    ...(input.resolvers?.routeResolver
      ? { routeResolver: input.resolvers.routeResolver }
      : {}),
  });
}

export function assertBookingIntervalsInsideTrip(
  intervals: readonly SameDayInterval[],
  trip: TripDocument,
) {
  const permitted = new Set(enumerateInclusiveDateStrings(trip.startDate, trip.endDate));
  const outside = intervals.find(interval => !permitted.has(interval.date));
  if (outside) {
    throw authError("VALIDATION_FAILED", "Confirmed fixed booking falls outside the proposed trip dates.", {
      targetId: outside.date,
    });
  }
}
