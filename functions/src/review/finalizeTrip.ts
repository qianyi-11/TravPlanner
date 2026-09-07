import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  approvalDocumentSchema,
  approvalResponseDocumentSchema,
  finalizeTripInputSchema,
  finalizeTripResultSchema,
  itineraryVersionDocumentSchema,
  reviewDraftDocumentSchema,
  validationSnapshotDocumentSchema,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireOwner,
  requirePlanningCycle,
  requireReviewRevision,
} from "../auth";
import { createValidationSnapshotInTransaction } from "../validation";
import { recalculateMembershipApprovals } from "./recalculateMembershipApprovals";

export async function finalizeTripHandler(request: CallableRequest<unknown>) {
  const uid = request.auth?.uid;
  if (!uid) throw authError("UNAUTHENTICATED", "Authentication is required.");
  const parsed = finalizeTripInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Finalize input is invalid.");
  const input = parsed.data;
  const db = getFirestore();

  return db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    const tripRef = db.collection("trips").doc(input.tripId);

    if (context.trip.phase === "FINALIZED") {
      const currentVersionId = context.trip.currentItineraryVersionId;
      if (!currentVersionId) {
        throw authError("CONFLICT", "Finalized trip is missing its current itinerary version.", { tripId: input.tripId });
      }
      const currentVersionSnapshot = await transaction.get(
        tripRef.collection("itineraryVersions").doc(currentVersionId),
      );
      const currentVersion = itineraryVersionDocumentSchema.safeParse(currentVersionSnapshot.data());
      if (
        currentVersion.success &&
        currentVersion.data.source === "FINALIZATION" &&
        currentVersion.data.sourceReviewDraftRevision === input.expectedReviewDraftRevision
      ) {
        return finalizeTripResultSchema.parse({
          versionId: currentVersionId,
          versionNumber: currentVersion.data.versionNumber,
          phase: "FINALIZED",
        });
      }
      throw authError("INVALID_PHASE", "Trip is already finalized with different authority.", { tripId: input.tripId });
    }
    if (context.trip.phase !== "REVIEW") {
      throw authError("INVALID_PHASE", "Trip must be in REVIEW to finalize.", { tripId: input.tripId });
    }
    if (context.trip.currentItineraryVersionId) {
      throw authError("CONFLICT", "Pre-finalization trip already has a current itinerary version.", { tripId: input.tripId });
    }

    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.activeOwnerId !== uid || membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip OWNER authority is inconsistent.", { tripId: input.tripId });
    }

    const draftRef = tripRef.collection("reviewDrafts").doc(String(context.trip.planningCycle));
    const draftSnapshot = await transaction.get(draftRef);
    const draft = reviewDraftDocumentSchema.safeParse(draftSnapshot.data());
    if (!draft.success) {
      throw authError("CONFLICT", "Current Review draft is missing or malformed.", { tripId: input.tripId });
    }
    requireReviewRevision(input.expectedReviewDraftRevision, draft.data.revision);

    const draftValidationSnapshot = await transaction.get(
      tripRef.collection("validationSnapshots").doc(draft.data.validationSnapshotId),
    );
    const draftValidation = validationSnapshotDocumentSchema.safeParse(draftValidationSnapshot.data());
    const validationTargetsDraft = draftValidation.success &&
      draftValidation.data.planningCycle === context.trip.planningCycle &&
      (draft.data.revision === 1
        ? draftValidation.data.scope === "ITINERARY_OPTION" && draftValidation.data.targetId === draft.data.sourceOptionId
        : draftValidation.data.scope === "REVIEW_DRAFT" && draftValidation.data.targetId === String(context.trip.planningCycle));
    if (!validationTargetsDraft || !draftValidation.success) {
      throw authError("CONFLICT", "Review draft validation authority is missing or stale.", { tripId: input.tripId });
    }
    if (draftValidation.data.result === "INVALID" || !draftValidation.data.schedulable) {
      throw authError("VALIDATION_FAILED", "Current Review draft is not schedulable under Validation authority.", {
        tripId: input.tripId,
        detail: draftValidation.data.reasonCodes.join(","),
      });
    }

    const approvalSnapshots = await transaction.get(tripRef.collection("approvals"));
    const approvals = approvalSnapshots.docs.map(snapshot => {
      const approval = approvalDocumentSchema.safeParse(snapshot.data());
      if (!approval.success) {
        throw authError("CONFLICT", "Approval state is malformed.", {
          tripId: input.tripId,
          targetId: snapshot.id,
        });
      }
      return { id: snapshot.id, data: approval.data };
    });
    const unresolvedMustDo = approvals.find(entry =>
      entry.data.planningCycle === context.trip.planningCycle &&
      entry.data.type === "MUST_DO_CONFLICT" &&
      entry.data.status === "PENDING",
    );
    if (unresolvedMustDo) {
      throw authError("APPROVAL_NOT_RESOLVED", "A Must-do conflict is unresolved.", {
        tripId: input.tripId,
        targetId: unresolvedMustDo.id,
      });
    }
    const unacceptedBudgetException = approvals.find(entry =>
      entry.data.planningCycle === context.trip.planningCycle &&
      entry.data.type === "BUDGET_EXCEPTION" &&
      entry.data.status !== "STALE" &&
      entry.data.status !== "APPROVED",
    );
    if (unacceptedBudgetException) {
      throw authError("BUDGET_EXCEPTION_REQUIRED", "Current Activity Budget exception has not been approved.", {
        tripId: input.tripId,
        targetId: unacceptedBudgetException.id,
      });
    }

    let finalApprovalRef: FirebaseFirestore.DocumentReference | undefined;
    let finalApprovalCounts: { yesCount: number; noCount: number } | undefined;
    if (!membership.isSolo) {
      const matching = approvals.filter(entry =>
        entry.data.type === "FINAL_ITINERARY" &&
        entry.data.subjectType === "REVIEW_DRAFT" &&
        entry.data.planningCycle === context.trip.planningCycle &&
        entry.data.subjectId === String(context.trip.planningCycle) &&
        entry.data.subjectRevision === draft.data.revision &&
        entry.data.status !== "STALE",
      );
      if (matching.length !== 1) {
        throw authError("APPROVAL_NOT_RESOLVED", "Exactly one current final-itinerary approval is required.", {
          tripId: input.tripId,
        });
      }
      const approval = matching[0];
      finalApprovalRef = tripRef.collection("approvals").doc(approval.id);
      const responsesSnapshot = await transaction.get(finalApprovalRef.collection("responses"));
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
      const [recalculated] = recalculateMembershipApprovals({
        approvals: [{
          approvalId: approval.id,
          status: approval.data.status,
          yesCount: approval.data.yesCount,
          noCount: approval.data.noCount,
          responses,
        }],
        activeMemberIds: membership.activeMemberIds,
      });
      if (recalculated.status !== "APPROVED") {
        throw authError("MAJORITY_REQUIRED", "Current ACTIVE-member majority has not approved the Review draft.", {
          tripId: input.tripId,
          targetId: approval.id,
        });
      }
      finalApprovalCounts = { yesCount: recalculated.yesCount, noCount: recalculated.noCount };
    }

    const versionRef = tripRef.collection("itineraryVersions").doc();
    const checkedAt = Timestamp.now();
    const versionValidationSnapshotId = createValidationSnapshotInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
      scope: "ITINERARY_VERSION",
      targetId: versionRef.id,
      evaluation: {
        result: draftValidation.data.result,
        schedulable: draftValidation.data.schedulable,
        reasonCodes: draftValidation.data.reasonCodes,
        hardChecks: draftValidation.data.hardChecks,
      },
      externalSnapshotIds: draftValidation.data.externalSnapshotIds,
      checkedAt,
    });
    const versionDocument = itineraryVersionDocumentSchema.parse({
      versionNumber: 1,
      source: "FINALIZATION",
      days: draft.data.days,
      validationSnapshotId: versionValidationSnapshotId,
      sourceReviewDraftRevision: draft.data.revision,
      createdBy: uid,
      createdAt: checkedAt,
    });
    if (finalApprovalRef && finalApprovalCounts) {
      transaction.update(finalApprovalRef, {
        status: "APPROVED",
        yesCount: finalApprovalCounts.yesCount,
        noCount: finalApprovalCounts.noCount,
        resolvedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.create(versionRef, versionDocument);
    transaction.update(tripRef, {
      currentItineraryVersionId: versionRef.id,
      phase: "FINALIZED",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return finalizeTripResultSchema.parse({
      versionId: versionRef.id,
      versionNumber: 1,
      phase: "FINALIZED",
    });
  });
}

export const finalizeTrip = onCall({ enforceAppCheck: true }, finalizeTripHandler);
