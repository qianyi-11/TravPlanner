import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  approvalDocumentSchema,
  changeRequestDocumentSchema,
  mergeChangeRequestChange,
  reviewChangeRequestInputSchema,
  reviewChangeRequestResultSchema,
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

async function staleApprovalIfPresent(input: {
  transaction: FirebaseFirestore.Transaction;
  tripId: string;
  approvalId?: string;
}) {
  if (!input.approvalId) return;
  const approvalRef = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("approvals")
    .doc(input.approvalId);
  const snapshot = await input.transaction.get(approvalRef);
  if (!snapshot.exists) return;
  const approval = approvalDocumentSchema.safeParse(snapshot.data());
  if (!approval.success) {
    throw authError("CONFLICT", "Change Request approval authority is malformed.", {
      tripId: input.tripId,
      targetId: input.approvalId,
    });
  }
  if (approval.data.status !== "STALE") {
    input.transaction.update(approvalRef, {
      status: "STALE",
      resolvedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function ensureStructuralApprovalForCurrentMembership(input: {
  transaction: FirebaseFirestore.Transaction;
  tripId: string;
  changeRequestId: string;
  changeRequestRef: FirebaseFirestore.DocumentReference;
  classification: "MINOR" | "STRUCTURAL";
  approvalId?: string;
  isSolo: boolean;
  uid: string;
}) {
  if (input.classification === "MINOR") {
    if (input.approvalId) {
      throw authError("CONFLICT", "MINOR Change Request unexpectedly has a group approval.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }
    return;
  }

  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  if (input.isSolo) {
    await staleApprovalIfPresent({
      transaction: input.transaction,
      tripId: input.tripId,
      approvalId: input.approvalId,
    });
    return;
  }

  if (input.approvalId) {
    const approvalRef = tripRef.collection("approvals").doc(input.approvalId);
    const snapshot = await input.transaction.get(approvalRef);
    const approval = approvalDocumentSchema.safeParse(snapshot.data());
    if (!approval.success) {
      throw authError("CONFLICT", "Change Request approval authority is missing or malformed.", {
        tripId: input.tripId,
        targetId: input.approvalId,
      });
    }
    if (
      approval.data.type !== "STRUCTURAL_CHANGE" ||
      approval.data.subjectType !== "CHANGE_REQUEST" ||
      approval.data.subjectId !== input.changeRequestId
    ) {
      throw authError("CONFLICT", "Change Request approval targets different authority.", {
        tripId: input.tripId,
        targetId: input.approvalId,
      });
    }
    if (approval.data.status !== "STALE") return;
  }

  const approvalRef = tripRef.collection("approvals").doc();
  const timestamp = FieldValue.serverTimestamp();
  input.transaction.create(approvalRef, approvalDocumentSchema.parse({
    type: "STRUCTURAL_CHANGE",
    subjectType: "CHANGE_REQUEST",
    subjectId: input.changeRequestId,
    status: "PENDING",
    yesCount: 0,
    noCount: 0,
    createdBy: input.uid,
    createdAt: timestamp,
  }));
  input.transaction.update(input.changeRequestRef, {
    approvalId: approvalRef.id,
    updatedAt: timestamp,
  });
}

export async function reviewChangeRequestHandler(
  request: CallableRequest<unknown>,
  resolvers: ChangeRequestResolvers = {},
) {
  const uid = request.auth?.uid;
  if (!uid) throw authError("UNAUTHENTICATED", "Authentication is required.");
  const parsed = reviewChangeRequestInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Change Request review input is invalid.");
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
    if (changeRequest.data.status === "APPLIED") {
      throw authError("CONFLICT", "Applied Change Requests cannot be reviewed again.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }

    if (
      changeRequest.data.baseItineraryVersionId !== input.expectedItineraryVersionId &&
      (changeRequest.data.status === "PENDING" || changeRequest.data.status === "APPROVED")
    ) {
      await staleApprovalIfPresent({
        transaction,
        tripId: input.tripId,
        approvalId: changeRequest.data.approvalId,
      });
      transaction.update(changeRequestRef, {
        status: "NEEDS_REVALIDATION",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { kind: "STALE" as const };
    }
    if (changeRequest.data.status === "NEEDS_REVALIDATION") {
      return { kind: "STALE" as const };
    }

    if (input.decision === "REJECT") {
      if (changeRequest.data.status !== "REJECTED") {
        await staleApprovalIfPresent({
          transaction,
          tripId: input.tripId,
          approvalId: changeRequest.data.approvalId,
        });
        transaction.update(changeRequestRef, {
          status: "REJECTED",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { kind: "REJECTED" as const };
    }

    if (changeRequest.data.status === "REJECTED") {
      throw authError("CONFLICT", "Rejected Change Requests cannot proceed.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }

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
      kind: "PROCEED" as const,
      trip: context.trip,
      membershipVersion: context.trip.membershipVersion,
      isSolo: membership.isSolo,
      classification: changeRequest.data.classification,
      approvalId: changeRequest.data.approvalId,
      change,
      version,
      proposal,
      requestShape: {
        operation: changeRequest.data.operation,
        payload: changeRequest.data.payload,
        classification: changeRequest.data.classification,
      },
    };
  });

  if (preflight.kind === "STALE") {
    return reviewChangeRequestResultSchema.parse({ status: "NEEDS_REVALIDATION" });
  }
  if (preflight.kind === "REJECTED") {
    return reviewChangeRequestResultSchema.parse({ status: "REJECTED" });
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
      throw authError("STALE_MEMBERSHIP_VERSION", "Change Request review membership authority changed.", {
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
      await staleApprovalIfPresent({
        transaction,
        tripId: input.tripId,
        approvalId: changeRequest.data.approvalId,
      });
      transaction.update(changeRequestRef, {
        status: "NEEDS_REVALIDATION",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { kind: "STALE" as const };
    }
    if (
      changeRequest.data.status === "APPLIED" ||
      changeRequest.data.status === "REJECTED" ||
      changeRequest.data.status === "NEEDS_REVALIDATION"
    ) {
      throw authError("CONFLICT", "Change Request is no longer eligible for review.", {
        tripId: input.tripId,
        targetId: input.changeRequestId,
      });
    }
    if (!sameSerializable(preflight.requestShape, {
      operation: changeRequest.data.operation,
      payload: changeRequest.data.payload,
      classification: changeRequest.data.classification,
    })) {
      throw authError("CONFLICT", "Change Request operation authority changed during validation.", {
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

    const timestamp = FieldValue.serverTimestamp();
    if (validation.evaluation.result === "INVALID" || !validation.evaluation.schedulable) {
      const validationSnapshotId = createValidationSnapshotInTransaction({
        transaction,
        tripId: input.tripId,
        planningCycle: context.trip.planningCycle,
        scope: "CHANGE_REQUEST",
        targetId: input.changeRequestId,
        evaluation: validation.evaluation,
        externalSnapshotIds: validation.externalSnapshotIds,
      });
      transaction.update(changeRequestRef, {
        status: "PENDING",
        validationSnapshotId,
        updatedAt: timestamp,
      });
      return {
        kind: "INVALID" as const,
        validationSnapshotId,
        reasons: validation.evaluation.reasonCodes,
      };
    }

    await ensureStructuralApprovalForCurrentMembership({
      transaction,
      tripId: input.tripId,
      changeRequestId: input.changeRequestId,
      changeRequestRef,
      classification: changeRequest.data.classification,
      approvalId: changeRequest.data.approvalId,
      isSolo: membership.isSolo,
      uid,
    });
    const validationSnapshotId = createValidationSnapshotInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
      scope: "CHANGE_REQUEST",
      targetId: input.changeRequestId,
      evaluation: validation.evaluation,
      externalSnapshotIds: validation.externalSnapshotIds,
    });
    transaction.update(changeRequestRef, {
      status: "APPROVED",
      validationSnapshotId,
      updatedAt: timestamp,
    });
    return { kind: "APPROVED" as const, validationSnapshotId };
  });

  if (outcome.kind === "STALE") {
    return reviewChangeRequestResultSchema.parse({ status: "NEEDS_REVALIDATION" });
  }
  if (outcome.kind === "INVALID") {
    throw authError("VALIDATION_FAILED", "Change Request did not pass itinerary feasibility validation.", {
      tripId: input.tripId,
      targetId: input.changeRequestId,
      detail: outcome.reasons.join(","),
      validationSnapshotId: outcome.validationSnapshotId,
    });
  }
  return reviewChangeRequestResultSchema.parse({
    status: "APPROVED",
    validationSnapshotId: outcome.validationSnapshotId,
  });
}

export const reviewChangeRequest = onCall(
  { enforceAppCheck: true },
  request => reviewChangeRequestHandler(request),
);
