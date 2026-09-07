import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  approvalDocumentSchema,
  applyMinorEditInputSchema,
  applyMinorEditResultSchema,
  fixedBookingDocumentSchema,
  reviewDraftDocumentSchema,
  submissionDocumentSchema,
  timeToMinutes,
  type ItineraryDay,
  type MinorEdit,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireOwner,
  requirePhase,
  requirePlanningCycle,
  requireReviewRevision,
} from "../auth";
import { normalizeBookingTiming } from "../bookings/normalizeBookingTiming";
import { createValidationSnapshotInTransaction, type SameDayInterval } from "../validation";
import {
  evaluateReviewDraftInTransaction,
  loadReviewCandidatesInTransaction,
  prepareReviewValidation,
  type PlaceDetailsResolver,
  type RouteResolver,
} from "./reviewValidation";

interface ReviewProviderResolvers {
  placeDetailsResolver?: PlaceDetailsResolver;
  routeResolver?: RouteResolver;
}

function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw authError("INVALID_INPUT", "Edited itinerary time must remain within one destination-local day.");
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function applyEdit(days: readonly ItineraryDay[], edit: MinorEdit): ItineraryDay[] {
  const nextDays = days.map(day => ({ ...day, items: day.items.map(item => ({ ...item })) }));
  let sourceDayIndex = -1;
  let itemIndex = -1;
  for (let dayIndex = 0; dayIndex < nextDays.length; dayIndex += 1) {
    const index = nextDays[dayIndex].items.findIndex(item => item.itemId === edit.itemId);
    if (index >= 0) {
      if (sourceDayIndex >= 0) throw authError("CONFLICT", "Review draft contains a duplicate itemId.", { targetId: edit.itemId });
      sourceDayIndex = dayIndex;
      itemIndex = index;
    }
  }
  if (sourceDayIndex < 0 || itemIndex < 0) {
    throw authError("NOT_FOUND", "Review itinerary item was not found.", { targetId: edit.itemId });
  }
  const item = nextDays[sourceDayIndex].items[itemIndex];
  if (!item.candidateId || item.itemId.startsWith("fixed:")) {
    throw authError("FIXED_BOOKING_CONFLICT", "Confirmed fixed-booking items cannot be changed by applyMinorEdit.", {
      targetId: edit.itemId,
    });
  }

  if (edit.type === "MOVE_ITEM") {
    const targetDayIndex = nextDays.findIndex(day => day.date === edit.targetDate);
    if (targetDayIndex < 0) {
      throw authError("INVALID_INPUT", "MOVE_ITEM targetDate must be a day in the current Review draft.", {
        targetId: edit.targetDate,
      });
    }
    const startMinute = timeToMinutes(edit.targetStartTime);
    if (startMinute === null) throw authError("INVALID_INPUT", "MOVE_ITEM targetStartTime is invalid.");
    const endTime = minutesToTime(startMinute + item.durationMinutes);
    const moved = { ...item, date: edit.targetDate, startTime: edit.targetStartTime, endTime };
    nextDays[sourceDayIndex].items.splice(itemIndex, 1);
    nextDays[targetDayIndex].items.push(moved);
  } else {
    const startMinute = timeToMinutes(item.startTime);
    if (startMinute === null) throw authError("CONFLICT", "Stored Review item start time is invalid.", { targetId: item.itemId });
    item.durationMinutes = edit.durationMinutes;
    item.endTime = minutesToTime(startMinute + edit.durationMinutes);
  }

  for (const day of nextDays) {
    day.items.sort((left, right) => left.startTime.localeCompare(right.startTime) || left.itemId.localeCompare(right.itemId));
  }
  return nextDays;
}

async function loadProtectedMustDoCandidateIds(input: {
  transaction: Parameters<typeof loadAuthoritativeMembershipState>[0];
  tripId: string;
  activeMemberIds: readonly string[];
}): Promise<Set<string>> {
  const snapshots = await input.transaction.get(
    getFirestore().collection("trips").doc(input.tripId).collection("submissions"),
  );
  const activeIds = new Set(input.activeMemberIds);
  const protectedIds = new Set<string>();
  for (const snapshot of snapshots.docs) {
    const parsed = submissionDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Submission authority is malformed.", { tripId: input.tripId, targetId: snapshot.id });
    }
    if (activeIds.has(parsed.data.memberId) && parsed.data.preference === "MUST_DO") {
      protectedIds.add(parsed.data.candidateId);
    }
  }
  return protectedIds;
}

async function loadConfirmedBookingIntervals(input: {
  transaction: Parameters<typeof loadAuthoritativeMembershipState>[0];
  tripId: string;
}): Promise<SameDayInterval[]> {
  const snapshots = await input.transaction.get(
    getFirestore().collection("trips").doc(input.tripId).collection("fixedBookings"),
  );
  const intervals: SameDayInterval[] = [];
  for (const snapshot of snapshots.docs) {
    const parsed = fixedBookingDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Fixed-booking authority is malformed.", { tripId: input.tripId, targetId: snapshot.id });
    }
    if (parsed.data.status !== "CONFIRMED") continue;
    const timing = normalizeBookingTiming({
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      durationMinutes: parsed.data.durationMinutes,
    });
    intervals.push({
      date: parsed.data.date,
      startMinute: timeToMinutes(timing.startTime)!,
      endMinute: timeToMinutes(timing.endTime)!,
    });
  }
  return intervals;
}

export async function applyMinorEditHandler(
  request: CallableRequest<unknown>,
  providers: ReviewProviderResolvers = {},
) {
  const uid = request.auth?.uid;
  if (!uid) throw authError("UNAUTHENTICATED", "Authentication is required.");
  const parsed = applyMinorEditInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Minor-edit input is invalid.");
  const input = parsed.data;
  const db = getFirestore();

  const preflight = await db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePhase(context, ["REVIEW"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    const draftSnapshot = await transaction.get(
      db.collection("trips").doc(input.tripId).collection("reviewDrafts").doc(String(context.trip.planningCycle)),
    );
    const draft = reviewDraftDocumentSchema.safeParse(draftSnapshot.data());
    if (!draft.success) throw authError("CONFLICT", "Current Review draft is missing or malformed.", { tripId: input.tripId });
    requireReviewRevision(input.expectedReviewDraftRevision, draft.data.revision);

    const editedDays = applyEdit(draft.data.days, input.edit);
    const candidates = await loadReviewCandidatesInTransaction({ transaction, tripId: input.tripId, days: editedDays });
    const targetItem = editedDays.flatMap(day => day.items).find(item => item.itemId === input.edit.itemId)!;
    const protectedMustDoIds = await loadProtectedMustDoCandidateIds({
      transaction,
      tripId: input.tripId,
      activeMemberIds: membership.activeMemberIds,
    });
    if (targetItem.candidateId && protectedMustDoIds.has(targetItem.candidateId)) {
      throw authError("MUST_DO_CONFLICT", "Accepted MUST_DO items cannot be changed by applyMinorEdit.", {
        tripId: input.tripId,
        targetId: targetItem.candidateId,
      });
    }

    return {
      trip: context.trip,
      membershipVersion: context.trip.membershipVersion,
      isSolo: membership.isSolo,
      editedDays,
      candidates,
    };
  });

  const preparation = await prepareReviewValidation({
    tripId: input.tripId,
    trip: preflight.trip,
    days: preflight.editedDays,
    candidates: preflight.candidates,
    ...providers,
  });

  return db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePhase(context, ["REVIEW"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    if (context.trip.membershipVersion !== preflight.membershipVersion) {
      throw authError("STALE_MEMBERSHIP_VERSION", "ACTIVE membership changed while the Review edit was being validated.", {
        tripId: input.tripId,
      });
    }
    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.isSolo !== preflight.isSolo || membership.activeOwnerId !== uid) {
      throw authError("STALE_MEMBERSHIP_VERSION", "Review decision membership authority changed.", { tripId: input.tripId });
    }

    const tripRef = db.collection("trips").doc(input.tripId);
    const draftRef = tripRef.collection("reviewDrafts").doc(String(context.trip.planningCycle));
    const draftSnapshot = await transaction.get(draftRef);
    const draft = reviewDraftDocumentSchema.safeParse(draftSnapshot.data());
    if (!draft.success) throw authError("CONFLICT", "Current Review draft is missing or malformed.", { tripId: input.tripId });
    requireReviewRevision(input.expectedReviewDraftRevision, draft.data.revision);

    const editedDays = applyEdit(draft.data.days, input.edit);
    const candidates = await loadReviewCandidatesInTransaction({ transaction, tripId: input.tripId, days: editedDays });
    if ([...candidates.keys()].sort().join("|") !== preparation.candidateIds.join("|")) {
      throw authError("CONFLICT", "Review candidate authority changed while validation was in progress.", { tripId: input.tripId });
    }
    const protectedMustDoIds = await loadProtectedMustDoCandidateIds({
      transaction,
      tripId: input.tripId,
      activeMemberIds: membership.activeMemberIds,
    });
    const targetItem = editedDays.flatMap(day => day.items).find(item => item.itemId === input.edit.itemId)!;
    if (targetItem.candidateId && protectedMustDoIds.has(targetItem.candidateId)) {
      throw authError("MUST_DO_CONFLICT", "Accepted MUST_DO items cannot be changed by applyMinorEdit.", {
        tripId: input.tripId,
        targetId: targetItem.candidateId,
      });
    }

    const confirmedBookingIntervals = await loadConfirmedBookingIntervals({ transaction, tripId: input.tripId });
    let validation;
    try {
      validation = await evaluateReviewDraftInTransaction({
        transaction,
        tripId: input.tripId,
        trip: context.trip,
        days: editedDays,
        preparation,
        confirmedBookingIntervals,
      });
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) {
        throw authError("VALIDATION_FAILED", error.message, { tripId: input.tripId });
      }
      throw error;
    }
    if (validation.evaluation.result === "INVALID" || !validation.evaluation.schedulable) {
      throw authError("VALIDATION_FAILED", "Minor edit did not pass itinerary feasibility validation.", {
        tripId: input.tripId,
        detail: validation.evaluation.reasonCodes.join(","),
      });
    }

    const approvalSnapshots = await transaction.get(tripRef.collection("approvals"));
    const currentFinalApprovals = approvalSnapshots.docs.flatMap(snapshot => {
      const approval = approvalDocumentSchema.safeParse(snapshot.data());
      if (!approval.success) return [];
      return approval.data.type === "FINAL_ITINERARY" &&
        approval.data.subjectType === "REVIEW_DRAFT" &&
        approval.data.planningCycle === context.trip.planningCycle &&
        approval.data.subjectId === String(context.trip.planningCycle) &&
        approval.data.subjectRevision === draft.data.revision &&
        approval.data.status !== "STALE"
        ? [{ ref: snapshot.ref }]
        : [];
    });

    const checkedAt = Timestamp.now();
    const validationSnapshotId = createValidationSnapshotInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
      scope: "REVIEW_DRAFT",
      targetId: String(context.trip.planningCycle),
      evaluation: validation.evaluation,
      externalSnapshotIds: validation.externalSnapshotIds,
      checkedAt,
    });
    const nextRevision = draft.data.revision + 1;
    const timestamp = FieldValue.serverTimestamp();

    let approvalId: string | undefined;
    if (membership.isSolo) {
      if (currentFinalApprovals.length > 0) {
        throw authError("CONFLICT", "Solo Review must not retain a current group final approval.", { tripId: input.tripId });
      }
    } else {
      for (const approval of currentFinalApprovals) transaction.update(approval.ref, { status: "STALE", resolvedAt: timestamp });
      const approvalRef = tripRef.collection("approvals").doc();
      approvalId = approvalRef.id;
      transaction.create(approvalRef, approvalDocumentSchema.parse({
        type: "FINAL_ITINERARY",
        planningCycle: context.trip.planningCycle,
        subjectType: "REVIEW_DRAFT",
        subjectId: String(context.trip.planningCycle),
        subjectRevision: nextRevision,
        status: "PENDING",
        yesCount: 0,
        noCount: 0,
        createdBy: uid,
        createdAt: timestamp,
      }));
    }

    transaction.update(draftRef, {
      revision: nextRevision,
      days: editedDays,
      validationSnapshotId,
      updatedAt: timestamp,
      updatedBy: uid,
    });
    transaction.update(tripRef, { updatedAt: timestamp });

    return applyMinorEditResultSchema.parse({ reviewDraftRevision: nextRevision, validationSnapshotId, approvalId });
  });
}

export const applyMinorEdit = onCall({ enforceAppCheck: true }, request => applyMinorEditHandler(request));
