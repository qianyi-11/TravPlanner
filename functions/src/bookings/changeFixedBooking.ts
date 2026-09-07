import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  changeFixedBookingInputSchema,
  changeFixedBookingResultSchema,
  fixedBookingDocumentSchema,
} from "@travel-planner/shared";
import {
  authError,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requireOwner,
  requirePhase,
  requirePlanningCycle,
} from "../auth";
import { normalizeBookingInputOrThrow } from "./normalizeBookingTiming";
import { parsePersistedFixedBookingOrThrow } from "./parsePersistedBooking";

export async function changeFixedBookingHandler(request: CallableRequest<unknown>) {
  // 1. Auth
  const uid = requireAuth(request);

  // Input parsing
  const parseResult = changeFixedBookingInputSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw authError("INVALID_INPUT", "Invalid change booking input.", {
      issues: parseResult.error.issues,
    });
  }
  const input = parseResult.data;

  // TX START
  return getFirestore().runTransaction(async (transaction) => {
    const db = getFirestore();
    const tripRef = db.collection("trips").doc(input.tripId);

    // 2. READ trip + member
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);

    // 3-6. CHEAP GUARDS (before reading booking)
    requireActiveMember(context);
    requireOwner(context);
    requirePhase(context, ["COLLECTING", "VOTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    // 7. READ booking
    const bookingRef = tripRef.collection("fixedBookings").doc(input.bookingId);
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) {
      throw authError("NOT_FOUND", "Fixed booking was not found.", {
        tripId: input.tripId,
        targetId: input.bookingId,
      });
    }

    // 8. Persisted data validation
    const existing = parsePersistedFixedBookingOrThrow(
      bookingSnapshot.data(),
      input.bookingId,
      input.tripId
    );

    // 9. Target status check: must be CONFIRMED
    if (existing.booking.status !== "CONFIRMED") {
      throw authError("CONFLICT", "Only CONFIRMED bookings can be changed.", {
        tripId: input.tripId,
        targetId: input.bookingId,
        status: existing.booking.status,
      });
    }

    let changed = false;

    if (input.action === "CANCEL") {
      // CANCEL branch
      changed = true;
      transaction.delete(bookingRef);
    } else {
      // UPDATE branch
      // 10. Date within trip range
      if (input.date < context.trip.startDate || input.date > context.trip.endDate) {
        throw authError("INVALID_INPUT", "Booking date is outside trip date range.", {
          tripId: input.tripId,
          date: input.date,
          startDate: context.trip.startDate,
          endDate: context.trip.endDate,
        });
      }

      // 11. Normalize input timing
      const normalized = normalizeBookingInputOrThrow(input);

      // 12. Check no-op vs mutation
      const rawExisting = existing.booking;
      const hasBothRawTiming =
        rawExisting.endTime !== undefined && rawExisting.durationMinutes !== undefined;
      const timingMatches =
        rawExisting.date === input.date &&
        rawExisting.startTime === normalized.startTime &&
        rawExisting.endTime === normalized.endTime &&
        rawExisting.durationMinutes === normalized.durationMinutes;

      if (hasBothRawTiming && timingMatches) {
        // No-op: already has both fields and matches input exactly
        changed = false;
      } else {
        // Mutation: legacy one-sided upgrade or different timing/date
        changed = true;
        const updatedRecord = {
          candidateId: existing.booking.candidateId,
          date: input.date,
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          durationMinutes: normalized.durationMinutes,
          status: "CONFIRMED" as const,
          reportedBy: existing.booking.reportedBy,
          reportedAt: existing.booking.reportedAt,
          confirmedBy: existing.booking.confirmedBy,
          confirmedAt: existing.booking.confirmedAt,
        };

        // 14. Validate updatedRecord with fixedBookingDocumentSchema
        fixedBookingDocumentSchema.parse(updatedRecord);
        transaction.set(bookingRef, updatedRecord);
      }
    }

    return changeFixedBookingResultSchema.parse({
      bookingId: input.bookingId,
      action: input.action,
      changed,
      phase: context.trip.phase,
      planningCycle: context.trip.planningCycle,
    });
  });
}

export const changeFixedBooking = onCall({ enforceAppCheck: true }, changeFixedBookingHandler);
