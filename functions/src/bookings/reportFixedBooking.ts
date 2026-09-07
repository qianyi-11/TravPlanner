import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  candidateDocumentSchema,
  fixedBookingDocumentSchema,
  reportFixedBookingInputSchema,
  reportFixedBookingResultSchema,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requirePhase,
  requirePlanningCycle,
} from "../auth";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";
import { normalizeBookingInputOrThrow } from "./normalizeBookingTiming";

export async function reportFixedBookingHandler(request: CallableRequest<unknown>) {
  // PRE-TX
  // 1. Auth
  const uid = requireAuth(request);

  // 2. Parse input schema
  const parseResult = reportFixedBookingInputSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw authError("INVALID_INPUT", "Invalid booking report input.", {
      issues: parseResult.error.issues,
    });
  }
  const input = parseResult.data;

  // 3. Normalize timing (INVALID_INPUT on bad timing)
  const normalizedTiming = normalizeBookingInputOrThrow(input);

  // 4. Allocate booking ID before transaction
  const bookingId = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("fixedBookings")
    .doc().id;

  // TX START
  return getFirestore().runTransaction(async (transaction) => {
    const db = getFirestore();
    const tripRef = db.collection("trips").doc(input.tripId);

    // 5. READ trip + caller member
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);

    // 6-8. CHEAP GUARDS
    requireActiveMember(context);
    requirePhase(context, ["COLLECTING", "VOTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    // 9. AUTHORITATIVE MEMBERSHIP & CANDIDATE READS
    const state = await loadAuthoritativeMembershipState(transaction, input.tripId);

    // 10. Membership authority consistency
    if (state.activeOwnerId !== context.trip.ownerId || !state.activeOwnerId) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", {
        tripId: input.tripId,
      });
    }

    // 11-12. Candidate validation
    const candidateRef = tripRef.collection("candidates").doc(input.candidateId);
    const candidateSnapshot = await transaction.get(candidateRef);
    if (!candidateSnapshot.exists) {
      throw authError("NOT_FOUND", "Candidate was not found.", {
        tripId: input.tripId,
        targetId: input.candidateId,
      });
    }

    const candidateParsed = candidateDocumentSchema.safeParse(candidateSnapshot.data());
    if (!candidateParsed.success) {
      throw authError("CONFLICT", "Candidate state is invalid.", {
        tripId: input.tripId,
        targetId: input.candidateId,
      });
    }

    if (candidateIdFromPlaceId(candidateParsed.data.placeId) !== input.candidateId) {
      throw authError("CONFLICT", "Candidate state is invalid.", {
        tripId: input.tripId,
        targetId: input.candidateId,
      });
    }

    // 13. Validate date is within trip range [startDate, endDate]
    if (input.date < context.trip.startDate || input.date > context.trip.endDate) {
      throw authError("INVALID_INPUT", "Booking date is outside trip date range.", {
        tripId: input.tripId,
        date: input.date,
        startDate: context.trip.startDate,
        endDate: context.trip.endDate,
      });
    }

    // 14. Determine solo/group
    const isSoloOwner = state.isSolo && state.activeOwnerId === uid;

    // 15. Writes
    const bookingRef = tripRef.collection("fixedBookings").doc(bookingId);
    let bookingDoc: Record<string, unknown>;
    let status: "CONFIRMED" | "PENDING_CONFIRMATION";

    if (isSoloOwner) {
      status = "CONFIRMED";
      bookingDoc = {
        candidateId: input.candidateId,
        date: input.date,
        startTime: normalizedTiming.startTime,
        endTime: normalizedTiming.endTime,
        durationMinutes: normalizedTiming.durationMinutes,
        status,
        reportedBy: uid,
        reportedAt: FieldValue.serverTimestamp(),
        confirmedBy: uid,
        confirmedAt: FieldValue.serverTimestamp(),
      };
    } else {
      status = "PENDING_CONFIRMATION";
      bookingDoc = {
        candidateId: input.candidateId,
        date: input.date,
        startTime: normalizedTiming.startTime,
        endTime: normalizedTiming.endTime,
        durationMinutes: normalizedTiming.durationMinutes,
        status,
        reportedBy: uid,
        reportedAt: FieldValue.serverTimestamp(),
      };
    }

    // Validate with fixedBookingDocumentSchema before writing
    fixedBookingDocumentSchema.parse(bookingDoc);
    transaction.set(bookingRef, bookingDoc);

    return reportFixedBookingResultSchema.parse({
      bookingId,
      status,
      phase: context.trip.phase,
      planningCycle: context.trip.planningCycle,
    });
  });
}

export const reportFixedBooking = onCall({ enforceAppCheck: true }, reportFixedBookingHandler);
