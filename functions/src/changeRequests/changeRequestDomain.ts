import { getFirestore, type Transaction } from "firebase-admin/firestore";
import {
  candidateDocumentSchema,
  fixedBookingDocumentSchema,
  itineraryVersionDocumentSchema,
  submissionDocumentSchema,
  validateMonetaryPrecision,
  isCanonicalCurrencyCode,
  type ChangeRequestChange,
  type ItineraryDay,
  type ItineraryItem,
  type ItineraryVersionDocument,
  type TripDocument,
} from "@travel-planner/shared";
import {
  authError,
  type AuthoritativeMembershipState,
} from "../auth";

export async function loadItineraryVersionInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  versionId: string;
}): Promise<ItineraryVersionDocument> {
  const snapshot = await input.transaction.get(
    getFirestore()
      .collection("trips")
      .doc(input.tripId)
      .collection("itineraryVersions")
      .doc(input.versionId),
  );
  const parsed = itineraryVersionDocumentSchema.safeParse(snapshot.data());
  if (!parsed.success) {
    throw authError("CONFLICT", "Current itinerary version is missing or malformed.", {
      tripId: input.tripId,
      targetId: input.versionId,
    });
  }
  return parsed.data;
}

export function findUniqueItineraryItem(
  days: readonly ItineraryDay[],
  itemId: string,
): { dayIndex: number; itemIndex: number; item: ItineraryItem } {
  let found: { dayIndex: number; itemIndex: number; item: ItineraryItem } | undefined;
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const itemIndex = days[dayIndex].items.findIndex(item => item.itemId === itemId);
    if (itemIndex < 0) continue;
    if (found) {
      throw authError("CONFLICT", "Itinerary contains a duplicate itemId.", { targetId: itemId });
    }
    found = { dayIndex, itemIndex, item: days[dayIndex].items[itemIndex] };
  }
  if (!found) {
    throw authError("NOT_FOUND", "Itinerary item was not found.", { targetId: itemId });
  }
  return found;
}

export function requireMutableActivityItem(
  days: readonly ItineraryDay[],
  itemId: string,
): { dayIndex: number; itemIndex: number; item: ItineraryItem & { candidateId: string } } {
  const found = findUniqueItineraryItem(days, itemId);
  if (!found.item.candidateId || found.item.itemId.startsWith("fixed:")) {
    throw authError(
      "INVALID_INPUT",
      "Activity Change Requests cannot mutate fixed-booking itinerary items.",
      { targetId: itemId },
    );
  }
  return found as {
    dayIndex: number;
    itemIndex: number;
    item: ItineraryItem & { candidateId: string };
  };
}

async function loadProtectedMustDoCandidateIds(input: {
  transaction: Transaction;
  tripId: string;
  activeMemberIds: readonly string[];
}): Promise<Set<string>> {
  const snapshots = await input.transaction.get(
    getFirestore().collection("trips").doc(input.tripId).collection("submissions"),
  );
  const activeIds = new Set(input.activeMemberIds);
  const result = new Set<string>();
  for (const snapshot of snapshots.docs) {
    const parsed = submissionDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Submission authority is malformed.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    if (activeIds.has(parsed.data.memberId) && parsed.data.preference === "MUST_DO") {
      result.add(parsed.data.candidateId);
    }
  }
  return result;
}

async function requireUsableCandidate(input: {
  transaction: Transaction;
  tripId: string;
  candidateId: string;
}) {
  const snapshot = await input.transaction.get(
    getFirestore()
      .collection("trips")
      .doc(input.tripId)
      .collection("candidates")
      .doc(input.candidateId),
  );
  const parsed = candidateDocumentSchema.safeParse(snapshot.data());
  if (!parsed.success) {
    throw authError("NOT_FOUND", "Change Request candidate was not found.", {
      tripId: input.tripId,
      targetId: input.candidateId,
    });
  }
  if (!parsed.data.active) {
    throw authError("CANDIDATE_INACTIVE", "Change Request candidate is inactive.", {
      tripId: input.tripId,
      targetId: input.candidateId,
    });
  }
  return parsed.data;
}

async function requireConfirmedBooking(input: {
  transaction: Transaction;
  tripId: string;
  bookingId: string;
}) {
  const snapshot = await input.transaction.get(
    getFirestore()
      .collection("trips")
      .doc(input.tripId)
      .collection("fixedBookings")
      .doc(input.bookingId),
  );
  const parsed = fixedBookingDocumentSchema.safeParse(snapshot.data());
  if (!parsed.success || parsed.data.status !== "CONFIRMED") {
    throw authError("NOT_FOUND", "Confirmed fixed booking was not found.", {
      tripId: input.tripId,
      targetId: input.bookingId,
    });
  }
  return parsed.data;
}

function representedCandidateIds(days: readonly ItineraryDay[]) {
  return new Set(days.flatMap(day => day.items.flatMap(item => item.candidateId ? [item.candidateId] : [])));
}

const ALWAYS_STRUCTURAL = new Set<ChangeRequestChange["operation"]>([
  "ADD_ACTIVITY",
  "REMOVE_ACTIVITY",
  "REPLACE_ACTIVITY",
  "CHANGE_FIXED_BOOKING",
  "CHANGE_DESTINATION",
  "CHANGE_TRIP_DATES",
  "CHANGE_BASE_LOCATION",
  "CHANGE_DAY_WINDOW",
  "CHANGE_TRANSPORT",
  "CHANGE_BUDGET",
]);

export async function classifyAndValidateChangeRequestInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  trip: TripDocument;
  membership: AuthoritativeMembershipState;
  version: ItineraryVersionDocument;
  change: ChangeRequestChange;
}): Promise<"MINOR" | "STRUCTURAL"> {
  const change = input.change;
  let touchedCandidateId: string | undefined;

  if (["MOVE_ACTIVITY", "CHANGE_TIME", "CHANGE_DURATION", "REMOVE_ACTIVITY", "REPLACE_ACTIVITY"].includes(change.operation)) {
    const itemId = (change as { itemId: string }).itemId;
    touchedCandidateId = requireMutableActivityItem(input.version.days, itemId).item.candidateId;
  }

  if (change.operation === "ADD_ACTIVITY") {
    await requireUsableCandidate({
      transaction: input.transaction,
      tripId: input.tripId,
      candidateId: change.candidateId,
    });
    if (representedCandidateIds(input.version.days).has(change.candidateId)) {
      throw authError("CONFLICT", "Candidate is already represented in the current itinerary.", {
        tripId: input.tripId,
        targetId: change.candidateId,
      });
    }
    if (change.targetDate && (change.targetDate < input.trip.startDate || change.targetDate > input.trip.endDate)) {
      throw authError("INVALID_INPUT", "ADD_ACTIVITY targetDate must be inside the trip date range.", {
        tripId: input.tripId,
        targetId: change.targetDate,
      });
    }
  }

  if (change.operation === "REPLACE_ACTIVITY") {
    await requireUsableCandidate({
      transaction: input.transaction,
      tripId: input.tripId,
      candidateId: change.replacementCandidateId,
    });
    const represented = representedCandidateIds(input.version.days);
    if (represented.has(change.replacementCandidateId) && change.replacementCandidateId !== touchedCandidateId) {
      throw authError("CONFLICT", "Replacement candidate is already represented in the current itinerary.", {
        tripId: input.tripId,
        targetId: change.replacementCandidateId,
      });
    }
    if (change.replacementCandidateId === touchedCandidateId) {
      throw authError("INVALID_INPUT", "Replacement candidate must differ from the current activity.", {
        tripId: input.tripId,
        targetId: change.replacementCandidateId,
      });
    }
  }

  if (change.operation === "CHANGE_FIXED_BOOKING") {
    await requireConfirmedBooking({
      transaction: input.transaction,
      tripId: input.tripId,
      bookingId: change.bookingId,
    });
    findUniqueItineraryItem(input.version.days, `fixed:${change.bookingId}`);
  }

  if (change.operation === "CHANGE_BUDGET" && "amount" in change) {
    if (!isCanonicalCurrencyCode(input.trip.activityBudgetCurrency)) {
      throw authError("INVALID_INPUT", "Trip currency is unsupported or non-canonical.", {
        tripId: input.tripId,
      });
    }
    if (!validateMonetaryPrecision(change.amount, input.trip.activityBudgetCurrency)) {
      throw authError("INVALID_INPUT", "Budget amount has invalid monetary precision.", {
        tripId: input.tripId,
      });
    }
  }

  if (ALWAYS_STRUCTURAL.has(change.operation)) return "STRUCTURAL";
  if (!touchedCandidateId) return "MINOR";

  const protectedIds = await loadProtectedMustDoCandidateIds({
    transaction: input.transaction,
    tripId: input.tripId,
    activeMemberIds: input.membership.activeMemberIds,
  });
  return protectedIds.has(touchedCandidateId) ? "STRUCTURAL" : "MINOR";
}
