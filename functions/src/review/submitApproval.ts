import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  approvalDocumentSchema,
  approvalResponseDocumentSchema,
  changeRequestDocumentSchema,
  reviewDraftDocumentSchema,
  submitApprovalInputSchema,
  submitApprovalResultSchema,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requirePhase,
} from "../auth";
import { recalculateMembershipApprovals } from "./recalculateMembershipApprovals";

export async function submitApprovalHandler(request: CallableRequest<unknown>) {
  const uid = request.auth?.uid;
  if (!uid) throw authError("UNAUTHENTICATED", "Authentication is required.");
  const parsed = submitApprovalInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Approval input is invalid.");
  const input = parsed.data;
  const db = getFirestore();

  return db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["REVIEW", "FINALIZED"]);
    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
    }
    if (membership.isSolo) {
      throw authError("NOT_APPLICABLE_FOR_SOLO", "Group approval is not applicable to a solo trip.", {
        tripId: input.tripId,
      });
    }

    const tripRef = db.collection("trips").doc(input.tripId);
    const approvalRef = tripRef.collection("approvals").doc(input.approvalId);
    const approvalSnapshot = await transaction.get(approvalRef);
    const approval = approvalDocumentSchema.safeParse(approvalSnapshot.data());
    if (!approval.success) {
      throw authError("NOT_FOUND", "Approval was not found.", {
        tripId: input.tripId,
        targetId: input.approvalId,
      });
    }
    if (approval.data.status === "STALE") {
      throw authError("CONFLICT", "Approval is stale.", {
        tripId: input.tripId,
        targetId: input.approvalId,
      });
    }

    if (context.trip.phase === "REVIEW") {
      const draftRef = tripRef.collection("reviewDrafts").doc(String(context.trip.planningCycle));
      const draftSnapshot = await transaction.get(draftRef);
      const draft = reviewDraftDocumentSchema.safeParse(draftSnapshot.data());
      if (!draft.success) {
        throw authError("CONFLICT", "Current Review draft authority is missing or malformed.", { tripId: input.tripId });
      }
      if (
        approval.data.type !== "FINAL_ITINERARY" ||
        approval.data.subjectType !== "REVIEW_DRAFT" ||
        approval.data.planningCycle !== context.trip.planningCycle ||
        approval.data.subjectId !== String(context.trip.planningCycle) ||
        approval.data.subjectRevision !== draft.data.revision
      ) {
        throw authError("CONFLICT", "Approval does not target the current Review draft revision.", {
          tripId: input.tripId,
          targetId: input.approvalId,
        });
      }
    } else {
      if (
        approval.data.type !== "STRUCTURAL_CHANGE" ||
        approval.data.subjectType !== "CHANGE_REQUEST"
      ) {
        throw authError("CONFLICT", "Approval does not target a structural Change Request.", {
          tripId: input.tripId,
          targetId: input.approvalId,
        });
      }
      const changeRequestRef = tripRef.collection("changeRequests").doc(approval.data.subjectId);
      const changeRequestSnapshot = await transaction.get(changeRequestRef);
      const changeRequest = changeRequestDocumentSchema.safeParse(changeRequestSnapshot.data());
      if (!changeRequest.success) {
        throw authError("CONFLICT", "Change Request approval target is missing or malformed.", {
          tripId: input.tripId,
          targetId: approval.data.subjectId,
        });
      }
      if (
        changeRequest.data.classification !== "STRUCTURAL" ||
        changeRequest.data.approvalId !== input.approvalId ||
        (changeRequest.data.status !== "PENDING" && changeRequest.data.status !== "APPROVED")
      ) {
        throw authError("CONFLICT", "Approval does not target a current eligible Change Request.", {
          tripId: input.tripId,
          targetId: approval.data.subjectId,
        });
      }
      if (
        !context.trip.currentItineraryVersionId ||
        changeRequest.data.baseItineraryVersionId !== context.trip.currentItineraryVersionId
      ) {
        throw authError("STALE_ITINERARY_VERSION", "Change Request approval targets a stale itinerary version.", {
          tripId: input.tripId,
          targetId: approval.data.subjectId,
          currentItineraryVersionId: context.trip.currentItineraryVersionId ?? null,
        });
      }
    }

    const responsesSnapshot = await transaction.get(approvalRef.collection("responses"));
    const responses = responsesSnapshot.docs.map(snapshot => {
      const response = approvalResponseDocumentSchema.safeParse(snapshot.data());
      if (!response.success) {
        throw authError("CONFLICT", "Approval response state is malformed.", {
          tripId: input.tripId,
          targetId: snapshot.id,
        });
      }
      return response.data;
    });
    const existingIndex = responses.findIndex(response => response.memberId === uid);
    if (existingIndex >= 0) {
      responses[existingIndex] = { ...responses[existingIndex], decision: input.decision };
    } else {
      responses.push({ memberId: uid, decision: input.decision, updatedAt: FieldValue.serverTimestamp() });
    }

    const [recalculation] = recalculateMembershipApprovals({
      approvals: [{
        approvalId: input.approvalId,
        status: approval.data.status,
        yesCount: approval.data.yesCount,
        noCount: approval.data.noCount,
        responses,
      }],
      activeMemberIds: membership.activeMemberIds,
    });
    const timestamp = FieldValue.serverTimestamp();
    const responseDocument = approvalResponseDocumentSchema.parse({
      memberId: uid,
      decision: input.decision,
      updatedAt: timestamp,
    });
    transaction.set(approvalRef.collection("responses").doc(uid), responseDocument);
    transaction.update(approvalRef, {
      status: recalculation.status,
      yesCount: recalculation.yesCount,
      noCount: recalculation.noCount,
      ...(recalculation.resolved ? { resolvedAt: timestamp } : { resolvedAt: FieldValue.delete() }),
    });

    return submitApprovalResultSchema.parse({
      approvalId: input.approvalId,
      status: recalculation.status,
      yesCount: recalculation.yesCount,
      noCount: recalculation.noCount,
      requiredApprovalCount: recalculation.requiredYesCount,
    });
  });
}

export const submitApproval = onCall({ enforceAppCheck: true }, submitApprovalHandler);
