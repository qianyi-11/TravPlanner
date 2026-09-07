import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  candidateVoteDocumentSchema,
  castCandidateVoteInputSchema,
  castCandidateVoteResultSchema,
  effectiveCandidateActivationVersion,
  legacyCandidateVoteReadSchema,
  type CandidateDocument,
  type LegacyCandidateVoteDocument,
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
import { candidateVoteId, isCandidateVoteIdentity } from "./candidateVoteIdentity";
import { candidateVoteScore } from "./candidateVoteAggregation";

export async function castCandidateVoteHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = castCandidateVoteInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Candidate-vote input is invalid.");
  const input = parsed.data;

  return getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["VOTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    const state = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (state.activeOwnerId !== context.trip.ownerId) throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
    if (state.activeMemberCount <= 1) throw authError("NOT_APPLICABLE_FOR_SOLO", "Voting is not applicable to a solo trip.", { tripId: input.tripId });
    if (!state.activeMemberIds.includes(uid)) throw authError("MEMBER_INACTIVE", "Trip membership is not active.", { tripId: input.tripId });

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const candidateRef = tripRef.collection("candidates").doc(input.candidateId);
    const voteRef = tripRef.collection("candidateVotes").doc(candidateVoteId(context.trip.planningCycle, input.candidateId, uid));
    const [candidateSnapshot, voteSnapshot] = await Promise.all([
      transaction.get(candidateRef),
      transaction.get(voteRef),
    ]);
    if (!candidateSnapshot.exists) throw authError("NOT_FOUND", "Candidate was not found.", { tripId: input.tripId, targetId: input.candidateId });
    const candidate = parseCandidate(candidateSnapshot.data(), input.candidateId, input.tripId);
    if (candidate.active !== true) throw authError("CANDIDATE_INACTIVE", "Candidate is inactive.", { tripId: input.tripId, targetId: input.candidateId });
    const activationVersion = effectiveCandidateActivationVersion(candidate);

    let existing: LegacyCandidateVoteDocument | undefined;
    if (voteSnapshot.exists) existing = parseVote(voteSnapshot.id, voteSnapshot.data(), input.tripId);
    if (existing && existing.memberId !== uid) throw authError("CONFLICT", "Candidate vote ownership is invalid.", { tripId: input.tripId, targetId: voteSnapshot.id });
    if (existing && existing.candidateId !== input.candidateId) throw authError("CONFLICT", "Candidate vote identity is invalid.", { tripId: input.tripId, targetId: voteSnapshot.id });

    if (existing && existing.value === input.value &&
      (existing.candidateActivationVersion ?? 1) === activationVersion) {
      return castCandidateVoteResultSchema.parse({ candidateId: input.candidateId, value: input.value });
    }

    const timestamp = FieldValue.serverTimestamp();
    if (!existing) {
      const record = {
        candidateId: input.candidateId,
        memberId: uid,
        value: input.value,
        score: candidateVoteScore(input.value),
        planningCycle: context.trip.planningCycle,
        candidateActivationVersion: activationVersion,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      candidateVoteDocumentSchema.parse(record);
      transaction.create(voteRef, record);
    } else {
      const replacement = {
        ...existing,
        memberId: uid,
        candidateId: input.candidateId,
        planningCycle: context.trip.planningCycle,
        value: input.value,
        score: candidateVoteScore(input.value),
        candidateActivationVersion: activationVersion,
        updatedAt: timestamp,
      };
      candidateVoteDocumentSchema.parse(replacement);
      transaction.update(voteRef, {
        memberId: uid,
        candidateId: input.candidateId,
        planningCycle: context.trip.planningCycle,
        value: input.value,
        score: candidateVoteScore(input.value),
        candidateActivationVersion: activationVersion,
        updatedAt: timestamp,
      });
    }
    return castCandidateVoteResultSchema.parse({ candidateId: input.candidateId, value: input.value });
  });
}

export const castCandidateVote = onCall({ enforceAppCheck: true }, castCandidateVoteHandler);

function parseCandidate(data: unknown, candidateId: string, tripId: string): CandidateDocument {
  const parsed = candidateDocumentSchema.safeParse(data);
  if (!parsed.success || candidateIdFromPlaceId(parsed.data.placeId) !== candidateId) throw authError("CONFLICT", "Candidate state is invalid.", { tripId, targetId: candidateId });
  return parsed.data;
}

function parseVote(snapshotId: string, data: unknown, tripId: string): LegacyCandidateVoteDocument {
  const parsed = legacyCandidateVoteReadSchema.safeParse(data);
  if (!parsed.success || !isCandidateVoteIdentity(snapshotId, parsed.data)) throw authError("CONFLICT", "Candidate vote state is invalid.", { tripId, targetId: snapshotId });
  return parsed.data;
}
