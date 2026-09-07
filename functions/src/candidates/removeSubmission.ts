import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  removeSubmissionInputSchema,
  removeSubmissionResultSchema,
  submissionDocumentSchema,
  type SubmissionDocument,
} from "@travel-planner/shared";
import { authError, loadAuthoritativeMembershipState, loadTripAuthContextInTransaction, requireActiveMember, requireAuth, requirePhase, requirePlanningCycle } from "../auth";
import { candidateIdFromPlaceId, submissionIdForCandidate } from "./candidateIdentity";
import { recalculateMembershipCandidateState } from "./recalculateMembershipCandidateState";

export async function removeSubmissionHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = removeSubmissionInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Submission removal input is invalid.");

  const input = parsed.data;
  const result = await getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["COLLECTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    const activeMembership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const candidateRef = tripRef.collection("candidates").doc(input.candidateId);
    const submissionId = submissionIdForCandidate(uid, input.candidateId);
    const submissionRef = tripRef.collection("submissions").doc(submissionId);
    const candidateSnapshot = await transaction.get(candidateRef);
    const submissionSnapshot = await transaction.get(submissionRef);

    if (!candidateSnapshot.exists || !submissionSnapshot.exists) {
      throw authError("NOT_FOUND", "Candidate submission was not found.", { tripId: input.tripId, targetId: input.candidateId });
    }

    const candidate = parseCandidate(candidateSnapshot.data(), input.candidateId, input.tripId);
    const submission = parseSubmission(submissionSnapshot.data(), submissionId, input.tripId);
    if (submission.memberId !== uid || submission.candidateId !== input.candidateId || candidateIdFromPlaceId(candidate.placeId) !== input.candidateId) {
      throw authError("CONFLICT", "Candidate and submission identity is inconsistent.", { tripId: input.tripId, targetId: input.candidateId });
    }

    const candidateSubmissionsSnapshot = await transaction.get(
      tripRef.collection("submissions").where("candidateId", "==", input.candidateId),
    );
    const remainingSubmissions = candidateSubmissionsSnapshot.docs
      .filter(snapshot => snapshot.id !== submissionId)
      .map(snapshot => parseSubmission(snapshot.data(), snapshot.id, input.tripId));
    const candidateState = recalculateMembershipCandidateState({
      candidates: [{ candidateId: input.candidateId, active: candidate.active }],
      submissions: remainingSubmissions,
      candidateVotes: [],
      activeMemberIds: activeMembership.activeMemberIds,
      planningCycle: context.trip.planningCycle,
    });
    const hasRemainingSupport = candidateState.supportedCandidateIds.includes(input.candidateId);
    const candidateDeactivated = candidate.active && !hasRemainingSupport;

    transaction.delete(submissionRef);
    if (candidateDeactivated) {
      transaction.update(candidateRef, {
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return removeSubmissionResultSchema.parse({ removed: true, candidateDeactivated });
  });

  return result;
}

export const removeSubmission = onCall({ enforceAppCheck: true }, removeSubmissionHandler);

function parseCandidate(data: unknown, candidateId: string, tripId: string) {
  const parsed = candidateDocumentSchema.safeParse(data);
  if (!parsed.success || candidateIdFromPlaceId(parsed.success ? parsed.data.placeId : "") !== candidateId) {
    throw authError("CONFLICT", "Candidate state is invalid.", { tripId, targetId: candidateId });
  }
  return parsed.data;
}

function parseSubmission(data: unknown, submissionId: string, tripId: string): SubmissionDocument {
  const parsed = submissionDocumentSchema.safeParse(data);
  if (!parsed.success || submissionIdForCandidate(parsed.success ? parsed.data.memberId : "", parsed.success ? parsed.data.candidateId : "") !== submissionId) {
    throw authError("CONFLICT", "Submission state is invalid.", { tripId, targetId: submissionId });
  }
  return parsed.data;
}
