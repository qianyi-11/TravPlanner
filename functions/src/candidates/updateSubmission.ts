import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  MAX_MUST_DO_SUBMISSIONS_PER_MEMBER,
  submissionDocumentSchema,
  updateSubmissionInputSchema,
  updateSubmissionResultSchema,
  type SubmissionDocument,
} from "@travel-planner/shared";
import { authError, loadTripAuthContextInTransaction, requireActiveMember, requireAuth, requirePhase, requirePlanningCycle } from "../auth";
import { candidateIdFromPlaceId, submissionIdForCandidate } from "./candidateIdentity";

export async function updateSubmissionHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = updateSubmissionInputSchema.safeParse(request.data);
  if (!parsed.success || parsed.data.patch.durationSource === "SYSTEM") {
    throw authError("INVALID_INPUT", "Submission update input is invalid.");
  }

  const input = parsed.data;
  const result = await getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["COLLECTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

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

    const patch = input.patch;
    const durationChanged = patch.estimatedDurationMinutes !== undefined && patch.estimatedDurationMinutes !== submission.estimatedDurationMinutes;
    const effectiveDurationSource = durationChanged
      ? "USER_OVERRIDE" as const
      : patch.durationSource ?? submission.durationSource;
    const effective = {
      ...submission,
      preference: patch.preference ?? submission.preference,
      preferredPeriod: patch.preferredPeriod ?? submission.preferredPeriod,
      estimatedDurationMinutes: patch.estimatedDurationMinutes ?? submission.estimatedDurationMinutes,
      durationSource: effectiveDurationSource,
    };
    if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
      if (patch.notes === "") delete effective.notes;
      else effective.notes = patch.notes;
    }
    if (!submissionDocumentSchema.safeParse(effective).success) {
      throw authError("CONFLICT", "Submission state is invalid.", { tripId: input.tripId, targetId: submissionId });
    }

    if (submission.preference !== "MUST_DO" && effective.preference === "MUST_DO") {
      const memberSubmissionsSnapshot = await transaction.get(
        tripRef.collection("submissions").where("memberId", "==", uid),
      );
      const otherMustDoCount = memberSubmissionsSnapshot.docs
        .map(snapshot => parseSubmission(snapshot.data(), snapshot.id, input.tripId))
        .filter(other => other.memberId === uid && other.preference === "MUST_DO" && other.candidateId !== input.candidateId)
        .length;
      if (otherMustDoCount >= MAX_MUST_DO_SUBMISSIONS_PER_MEMBER) {
        throw authError("LIMIT_EXCEEDED", "A member may mark at most two candidates as MUST_DO.", { tripId: input.tripId });
      }
    }

    const updates: Record<string, unknown> = {};
    for (const field of ["preference", "preferredPeriod", "estimatedDurationMinutes", "durationSource"] as const) {
      if (effective[field] !== submission[field]) updates[field] = effective[field];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
      if (patch.notes === "") {
        if (Object.prototype.hasOwnProperty.call(submission, "notes")) updates.notes = FieldValue.delete();
      } else if (patch.notes !== submission.notes || !Object.prototype.hasOwnProperty.call(submission, "notes")) {
        updates.notes = patch.notes;
      }
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      transaction.update(submissionRef, updates);
    }

    return updateSubmissionResultSchema.parse({ submissionId, updated: true });
  });

  return result;
}

export const updateSubmission = onCall({ enforceAppCheck: true }, updateSubmissionHandler);

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
