import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  confirmFixedBookingInputSchema,
  confirmFixedBookingResultSchema,
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
import { parsePersistedFixedBookingOrThrow } from "./parsePersistedBooking";

export async function confirmFixedBookingHandler(request: CallableRequest<unknown>) {
  // 1. Auth
  const uid = requireAuth(request);

  // Input validation
  const parseResult = confirmFixedBookingInputSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw authError("INVALID_INPUT", "Invalid confirm booking input.", {
      issues: parseResult.error.issues,
    });
  }
  const input = parseResult.data;

  // TX START
  return getFirestore().runTransaction(async (transaction) => {
    const db = getFirestore();
    const tripRef = db.collection("trips").doc(input.tripId);

    // 1. READ trip + member
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);

    // 2-5. CHEAP GUARDS (before reading booking)
    requireActiveMember(context);
    requireOwner(context);
    requirePhase(context, ["COLLECTING", "VOTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    // 6-8. READ booking
    const bookingRef = tripRef.collection("fixedBookings").doc(input.bookingId);
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) {
      throw authError("NOT_FOUND", "Fixed booking was not found.", {
        tripId: input.tripId,
        targetId: input.bookingId,
      });
    }

    const existing = parsePersistedFixedBookingOrThrow(
      bookingSnapshot.data(),
      input.bookingId,
      input.tripId
    );

    // 9-10. APPLY
    let changed = false;
    if (existing.booking.status === "CONFIRMED") {
      // Already CONFIRMED: idempotent, no write
      changed = false;
    } else {
      // PENDING_CONFIRMATION -> CONFIRMED
      changed = true;
      const confirmedDoc = {
        candidateId: existing.booking.candidateId,
        date: existing.booking.date,
        startTime: existing.normalizedTiming.startTime,
        endTime: existing.normalizedTiming.endTime,
        durationMinutes: existing.normalizedTiming.durationMinutes,
        status: "CONFIRMED" as const,
        reportedBy: existing.booking.reportedBy,
        reportedAt: existing.booking.reportedAt,
        confirmedBy: uid,
        confirmedAt: FieldValue.serverTimestamp(),
      };

      fixedBookingDocumentSchema.parse(confirmedDoc);
      transaction.set(bookingRef, confirmedDoc);
    }

    return confirmFixedBookingResultSchema.parse({
      bookingId: input.bookingId,
      status: "CONFIRMED",
      changed,
      phase: context.trip.phase,
      planningCycle: context.trip.planningCycle,
    });
  });
}

export const confirmFixedBooking = onCall({ enforceAppCheck: true }, confirmFixedBookingHandler);
