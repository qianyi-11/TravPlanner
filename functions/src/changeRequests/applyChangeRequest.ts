import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  activityBudgetWriteSchema,
  approvalDocumentSchema,
  approvalResponseDocumentSchema,
  applyChangeRequestInputSchema,
  applyChangeRequestResultSchema,
  changeRequestDocumentSchema,
  itineraryVersionDocumentSchema,
  mergeChangeRequestChange,
  type ApprovalDocument,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireCurrentVersion,
  requireOwner,
  requirePhase,
} from "../auth";
import { createValidationSnapshotInTransaction } from "../validation";
import { recalculateMembershipApprovals } from "../review/recalculateMembershipApprovals";
import {
  evaluateReviewDraftInTransaction,
  loadReviewCandidatesInTransaction,
} from "../review/reviewValidation";
import { loadItineraryVersionInTransaction } from "./changeRequestDomain";
import {
  applyExternalTripChange,
  applyPlanningChange,
  assertBookingIntervalsInsideTrip,
  materializeTransactionalChangeProposal,
  prepareFullChangeValidation,
  type ChangeRequestResolvers,
  type TransactionalChangeProposal,
} from "./changeRequestProposal";

function sameSerializable(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function markNeedsRevalidation(input: {
  transaction: FirebaseFirestore.Transaction;
  tripId: string;
  changeRequestRef: FirebaseFirestore.DocumentReference;
  approvalId?: string;
}) {
  let approvalRef: FirebaseFirestore.DocumentReference | undefined;
  if (input.approvalId) {
    const candidateRef = getFirestore()
      .collection("trips")
      .doc(input.tripId)
      .collection("approvals")
      .doc(input.approvalId);
    const snapshot = await input.transaction.get(candidateRef);
    if (snapshot.exists) {
      const approval = approvalDocumentSchema.safeParse(snapshot.data());
      if (!approval.success) {
        throw authError("CONFLICT", "Change Request approval authority is malformed.", {
          tripId: input.tripId,
          targetId: input.approvalId,
        });
      }
      if (approval.data.status !== "STALE") approvalRef = candidateRef;
    }
  }
  const timestamp = FieldValue.serverTimestamp();
  input.transaction.update(input.changeRequestRef, {
    status: "NEEDS_REVALIDATION",
    updatedAt: timestamp,
  });
  if (approvalRef) {
    input.transaction.update(approvalRef, { status: "STALE", resolvedAt: timestamp });
  }
}

async function loadStructuralApprovalAuthority(input: {
  transaction: FirebaseFirestore.Transaction;
  tripId: string;
  changeRequestId: string;
  classification: "MINOR" | "STRUCTURAL";
  approvalId?: string;
  isSolo: boolean;
  activeMemberIds: readonly string[];
}) {
  if (input.classification === "MINOR" || input.isSolo) return undefined;
  if (!input.approvalId) {
    throw authError("APPROVAL_NOT_RESOLVED", "Group structural Change Request is missing its approval.", {
      tripId: input.tripId,
      targetId: input.changeRequestId,
    });
  }

  const approvalRef = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("approvals")
    .doc(input.approvalId);
  const approvalSnapshot = await input.transaction.get(approvalRef);
  const approval = approvalDocumentSchema.safeParse(approvalSnapshot.data());
  if (!approval.success) {
    throw authError("APPROVAL_NOT_RESOLVED", "Change Request approval is missing or malformed.", {
      tripId: input.tripId,
      targetId: input.approvalId,
    });
  }
  if (
    approval.data.type !== "STRUCTURAL_CHANGE" ||
    approval.data.subjectType !== "CHANGE_REQUEST" ||
    approval.data.subjectId !== input.changeRequestId ||
    approval.data.status === "STALE"
  ) {
    throw authError("APPROVAL_NOT_RESOLVED", "Change Request approval does not target the current request.", {
      tripId: input.tripId,
      targetId: input.approvalId,
    });
  }

  const responsesSnapshot = await input.transaction.get(approvalRef.collection("responses"));
  const responses = responsesSnapshot.docs.map(snapshot => {
    const response = approvalResponseDocumentSchema.safeParse(snapshot.data());
    if (!response.success) {
      throw authError("CONFLICT", "Change Request approval response state is malformed.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    return response.data;
  });
  const [recalculated] = recalculateMembershipApprovals({
    approvals: [{
      approvalId: input.approvalId,
      status: approval.data.status,
      yesCount: approval.data.yesCount,
      noCount: approval.data.noCount,
      responses,
    }],
    activeMemberIds: input.activeMemberIds,
  });
  if (recalculated.status === "PENDING") {
    throw authError("MAJORITY_REQUIRED", "Current ACTIVE-member majority has not approved the structural Change Request.", {
      tripId: input.tripId,
      targetId: input.approvalId,
    });
  }
  if (recalculated.status !== "APPROVED") {
    throw authError("APPROVAL_NOT_RESOLVED", "Structural Change Request approval is not approved.", {
      tripId: input.tripId,
      targetId: input.approvalId,
    });
  }
  return {
    ref: approvalRef,
    approval: approval.data as ApprovalDocument,
    yesCount: recalculated.yesCount,
    noCount: recalculated.noCount,
  };
}

export async function applyChangeRequestHandler(
  request: CallableRequest<unknown>,
  resolvers: ChangeRequestResolvers = {},
) {
  const uid = request.auth?.uid;
  if (!uid) throw authError("UNAUTHENTICATED", "Authentication is required.");
  const parsed = applyChangeRequestInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Apply Change Request input is invalid.");
  const input = parsed.data;
  const db = getFirestore();
  const tripRef = db.collection("trips").doc(input.tripId);
  const changeRequestRef = tripRef.collection("changeRequests").doc(input.changeRequestId);

  const preflight = await db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePhase(context, ["FINALIZED"]);
    requireCurrentVersion(context, input.expectedItineraryVersionId);
    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.activeOwnerId !== uid || membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip OWNER authority is inconsistent.", { tripId: input.tripId });
    }

    const requestSnapshot = await transaction.get(changeRequestRef);
    const changeRequest = changeRequestDocumentSchema.safeParse(requestSnapshot.data());
    if (!changeRequest.success) {
      throw authError("NOT_FOUND", "Change Request was not found or is malformed.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }
    if (
      changeRequest.data.baseItineraryVersionId !== input.expectedItineraryVersionId &&
      (changeRequest.data.status === "PENDING" || changeRequest.data.status === "APPROVED")
    ) {
      await markNeedsRevalidation({
        transaction,
        tripId: input.tripId,
        changeRequestRef,
        approvalId: changeRequest.data.approvalId,
      });
      return { kind: "STALE" as const };
    }
    if (changeRequest.data.status !== "APPROVED") {
      throw authError("APPROVAL_NOT_RESOLVED", "Change Request must be OWNER-reviewed before application.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
        detail: changeRequest.data.status,
      });
    }

    await loadStructuralApprovalAuthority({
      transaction,
      tripId: input.tripId,
      changeRequestId: input.changeRequestId,
      classification: changeRequest.data.classification,
      approvalId: changeRequest.data.approvalId,
      isSolo: membership.isSolo,
      activeMemberIds: membership.activeMemberIds,
    });

    const version = await loadItineraryVersionInTransaction({
      transaction,
      tripId: input.tripId,
      versionId: input.expectedItineraryVersionId,
    });
    const change = mergeChangeRequestChange({
      operation: changeRequest.data.operation,
      payload: changeRequest.data.payload,
    });
    const proposal = await materializeTransactionalChangeProposal({
      transaction,
      tripId: input.tripId,
      uid,
      trip: context.trip,
      membership,
      baseDays: version.days,
      change,
    });

    return {
      kind: "READY" as const,
      trip: context.trip,
      membershipVersion: context.trip.membershipVersion,
      isSolo: membership.isSolo,
      change,
      version,
      proposal,
      requestShape: {
        operation: changeRequest.data.operation,
        payload: changeRequest.data.payload,
        classification: changeRequest.data.classification,
        approvalId: changeRequest.data.approvalId,
      },
    };
  });

  if (preflight.kind === "STALE") {
    throw authError("STALE_ITINERARY_VERSION", "Change Request base itinerary is no longer current.", {
      tripId: input.tripId,
      targetId: input.changeRequestId,
      expectedItineraryVersionId: input.expectedItineraryVersionId,
    });
  }

  const externallyUpdatedTrip = await applyExternalTripChange({
    trip: preflight.proposal.proposedTrip,
    change: preflight.change,
    placeResolver: resolvers.placeResolver,
  });
  const proposedDays = await applyPlanningChange({
    tripId: input.tripId,
    trip: externallyUpdatedTrip,
    days: preflight.proposal.proposedDays,
    change: preflight.change,
    resolvers,
  });
  assertBookingIntervalsInsideTrip(preflight.proposal.confirmedBookingIntervals, externallyUpdatedTrip);
  const validationPreparation = await prepareFullChangeValidation({
    tripId: input.tripId,
    trip: externallyUpdatedTrip,
    days: proposedDays,
    resolvers,
  });

  const outcome = await db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePhase(context, ["FINALIZED"]);
    requireCurrentVersion(context, input.expectedItineraryVersionId);
    if (context.trip.membershipVersion !== preflight.membershipVersion) {
      throw authError("STALE_MEMBERSHIP_VERSION", "ACTIVE membership changed while the Change Request was being validated.", {
        tripId: input.tripId,
      });
    }
    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.isSolo !== preflight.isSolo || membership.activeOwnerId !== uid || membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("STALE_MEMBERSHIP_VERSION", "Change Request application membership authority changed.", {
        tripId: input.tripId,
      });
    }

    const requestSnapshot = await transaction.get(changeRequestRef);
    const changeRequest = changeRequestDocumentSchema.safeParse(requestSnapshot.data());
    if (!changeRequest.success) {
      throw authError("CONFLICT", "Change Request authority changed or is malformed.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }
    if (changeRequest.data.baseItineraryVersionId !== input.expectedItineraryVersionId) {
      await markNeedsRevalidation({
        transaction,
        tripId: input.tripId,
        changeRequestRef,
        approvalId: changeRequest.data.approvalId,
      });
      return { kind: "STALE" as const };
    }
    if (changeRequest.data.status !== "APPROVED") {
      throw authError("APPROVAL_NOT_RESOLVED", "Change Request is no longer eligible for application.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
        detail: changeRequest.data.status,
      });
    }
    if (!sameSerializable(preflight.requestShape, {
      operation: changeRequest.data.operation,
      payload: changeRequest.data.payload,
      classification: changeRequest.data.classification,
      approvalId: changeRequest.data.approvalId,
    })) {
      throw authError("CONFLICT", "Change Request authority changed while validation was in progress.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }

    const version = await loadItineraryVersionInTransaction({
      transaction,
      tripId: input.tripId,
      versionId: input.expectedItineraryVersionId,
    });
    const currentProposal: TransactionalChangeProposal = await materializeTransactionalChangeProposal({
      transaction,
      tripId: input.tripId,
      uid,
      trip: context.trip,
      membership,
      baseDays: version.days,
      change: preflight.change,
    });
    if (!sameSerializable(currentProposal, preflight.proposal)) {
      throw authError("CONFLICT", "Change Request mutation authority changed while validation was in progress.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }

    const candidates = await loadReviewCandidatesInTransaction({
      transaction,
      tripId: input.tripId,
      days: proposedDays,
    });
    if ([...candidates.keys()].sort().join("|") !== validationPreparation.candidateIds.join("|")) {
      throw authError("CONFLICT", "Change Request candidate authority changed while validation was in progress.", {
        tripId: input.tripId,
      });
    }

    let validation;
    try {
      validation = await evaluateReviewDraftInTransaction({
        transaction,
        tripId: input.tripId,
        trip: externallyUpdatedTrip,
        days: proposedDays,
        preparation: validationPreparation,
        confirmedBookingIntervals: currentProposal.confirmedBookingIntervals,
      });
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) {
        throw authError("VALIDATION_FAILED", error.message, { tripId: input.tripId });
      }
      throw error;
    }

    const approvalAuthority = await loadStructuralApprovalAuthority({
      transaction,
      tripId: input.tripId,
      changeRequestId: input.changeRequestId,
      classification: changeRequest.data.classification,
      approvalId: changeRequest.data.approvalId,
      isSolo: membership.isSolo,
      activeMemberIds: membership.activeMemberIds,
    });
    let soloApprovalRef: FirebaseFirestore.DocumentReference | undefined;
    if (membership.isSolo && changeRequest.data.approvalId) {
      const ref = tripRef.collection("approvals").doc(changeRequest.data.approvalId);
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const approval = approvalDocumentSchema.safeParse(snapshot.data());
        if (!approval.success) {
          throw authError("CONFLICT", "Obsolete group approval authority is malformed.", {
            tripId: input.tripId,
            targetId: changeRequest.data.approvalId,
          });
        }
        if (approval.data.status !== "STALE") soloApprovalRef = ref;
      }
    }

    const pendingRequestSnapshots = await transaction.get(tripRef.collection("changeRequests"));
    const olderPendingRequests = pendingRequestSnapshots.docs.flatMap(snapshot => {
      if (snapshot.id === input.changeRequestId) return [];
      const parsedRequest = changeRequestDocumentSchema.safeParse(snapshot.data());
      if (!parsedRequest.success) {
        throw authError("CONFLICT", "Change Request collection contains malformed authority.", {
          tripId: input.tripId,
          targetId: snapshot.id,
        });
      }
      if (
        (parsedRequest.data.status === "PENDING" || parsedRequest.data.status === "APPROVED") &&
        parsedRequest.data.baseItineraryVersionId === input.expectedItineraryVersionId
      ) {
        return [{ ref: snapshot.ref, approvalId: parsedRequest.data.approvalId }];
      }
      return [];
    });

    const changeValidationSnapshotId = createValidationSnapshotInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
      scope: "CHANGE_REQUEST",
      targetId: input.changeRequestId,
      evaluation: validation.evaluation,
      externalSnapshotIds: validation.externalSnapshotIds,
    });
    if (validation.evaluation.result === "INVALID" || !validation.evaluation.schedulable) {
      transaction.update(changeRequestRef, {
        validationSnapshotId: changeValidationSnapshotId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        kind: "INVALID" as const,
        validationSnapshotId: changeValidationSnapshotId,
        reasons: validation.evaluation.reasonCodes,
      };
    }

    const versionRef = tripRef.collection("itineraryVersions").doc();
    const checkedAt = Timestamp.now();
    const versionValidationSnapshotId = createValidationSnapshotInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
      scope: "ITINERARY_VERSION",
      targetId: versionRef.id,
      evaluation: validation.evaluation,
      externalSnapshotIds: validation.externalSnapshotIds,
      checkedAt,
    });
    const nextVersionNumber = version.versionNumber + 1;
    const versionDocument = itineraryVersionDocumentSchema.parse({
      versionNumber: nextVersionNumber,
      baseVersionId: input.expectedItineraryVersionId,
      source: "CHANGE_REQUEST",
      days: proposedDays,
      validationSnapshotId: versionValidationSnapshotId,
      appliedChangeRequestId: input.changeRequestId,
      createdBy: uid,
      createdAt: checkedAt,
    });
    const timestamp = FieldValue.serverTimestamp();

    if (approvalAuthority) {
      transaction.update(approvalAuthority.ref, {
        status: "APPROVED",
        yesCount: approvalAuthority.yesCount,
        noCount: approvalAuthority.noCount,
        resolvedAt: timestamp,
      });
    }
    if (soloApprovalRef) {
      transaction.update(soloApprovalRef, { status: "STALE", resolvedAt: timestamp });
    }

    if (currentProposal.budgetMutation) {
      const budgetRef = tripRef.collection("activityBudgets").doc(uid);
      if (currentProposal.budgetMutation.kind === "CLEAR") {
        transaction.delete(budgetRef);
      } else {
        const budgetDocument = activityBudgetWriteSchema.parse({
          memberId: uid,
          amount: currentProposal.budgetMutation.amount,
          currency: externallyUpdatedTrip.activityBudgetCurrency,
          planningCycleUpdated: context.trip.planningCycle,
          updatedAt: timestamp,
        });
        transaction.set(budgetRef, budgetDocument);
      }
    }

    if (currentProposal.bookingMutation) {
      const bookingRef = tripRef.collection("fixedBookings").doc(currentProposal.bookingMutation.bookingId);
      if (currentProposal.bookingMutation.kind === "CANCEL") {
        transaction.delete(bookingRef);
      } else {
        transaction.set(bookingRef, currentProposal.bookingMutation.updatedBooking!);
      }
    }

    transaction.create(versionRef, versionDocument);
    transaction.update(tripRef, {
      destination: externallyUpdatedTrip.destination,
      startDate: externallyUpdatedTrip.startDate,
      endDate: externallyUpdatedTrip.endDate,
      timezone: externallyUpdatedTrip.timezone,
      baseLocation: externallyUpdatedTrip.baseLocation,
      defaultDayWindow: externallyUpdatedTrip.defaultDayWindow,
      dayOverrides: externallyUpdatedTrip.dayOverrides,
      primaryTransport: externallyUpdatedTrip.primaryTransport,
      safeActivityBudgetCeiling: externallyUpdatedTrip.safeActivityBudgetCeiling ?? FieldValue.delete(),
      currentItineraryVersionId: versionRef.id,
      updatedAt: timestamp,
    });
    transaction.update(changeRequestRef, {
      status: "APPLIED",
      validationSnapshotId: changeValidationSnapshotId,
      resultingVersionId: versionRef.id,
      updatedAt: timestamp,
    });

    for (const older of olderPendingRequests) {
      transaction.update(older.ref, { status: "NEEDS_REVALIDATION", updatedAt: timestamp });
      if (older.approvalId) {
        transaction.update(tripRef.collection("approvals").doc(older.approvalId), {
          status: "STALE",
          resolvedAt: timestamp,
        });
      }
    }

    return {
      kind: "APPLIED" as const,
      resultingVersionId: versionRef.id,
      versionNumber: nextVersionNumber,
    };
  });

  if (outcome.kind === "STALE") {
    throw authError("STALE_ITINERARY_VERSION", "Change Request base itinerary is no longer current.", {
      tripId: input.tripId,
      targetId: input.changeRequestId,
      expectedItineraryVersionId: input.expectedItineraryVersionId,
    });
  }
  if (outcome.kind === "INVALID") {
    throw authError("VALIDATION_FAILED", "Change Request did not pass itinerary feasibility validation.", {
      tripId: input.tripId,
      targetId: input.changeRequestId,
      detail: outcome.reasons.join(","),
      validationSnapshotId: outcome.validationSnapshotId,
    });
  }
  return applyChangeRequestResultSchema.parse({
    changeRequestId: input.changeRequestId,
    resultingVersionId: outcome.resultingVersionId,
    versionNumber: outcome.versionNumber,
    status: "APPLIED",
  });
}

export const applyChangeRequest = onCall(
  { enforceAppCheck: true },
  request => applyChangeRequestHandler(request),
);
