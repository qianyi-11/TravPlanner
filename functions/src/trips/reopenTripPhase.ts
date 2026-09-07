import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { onCall, type CallableRequest, type CallableResponse } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  candidateVoteDocumentSchema,
  legacyCandidateVoteReadSchema,
  reopenTripPhaseInputSchema,
  reopenTripPhaseResultSchema,
  submissionDocumentSchema,
  type CandidateDocument,
  type LegacyCandidateVoteDocument,
  type SubmissionDocument,
  type ReopenTripPhaseInput,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requireOwner,
  requirePlanningCycle,
} from "../auth";
import { candidateIdFromPlaceId, submissionIdForCandidate } from "../candidates/candidateIdentity";
import { recalculateMembershipCandidateState } from "../candidates/recalculateMembershipCandidateState";
import { resetMembershipShortlistState } from "../shortlist/resetMembershipShortlistState";
import { candidateVoteId, isCandidateVoteIdentity } from "../voting/candidateVoteIdentity";
import { carryForwardCandidateVotes } from "../voting/carryForwardCandidateVotes";

export async function reopenTripPhaseHandler(
  request: CallableRequest<unknown>,
  _response?: CallableResponse<unknown>,
  // Test-only: deterministic emulator ordering without holding Firestore read locks.
  testHooks?: { beforeTransaction?: () => Promise<void> },
) {
  const uid = requireAuth(request);
  const parsed = reopenTripPhaseInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Reopen-trip input is invalid.");
  const input = parsed.data;

  await testHooks?.beforeTransaction?.();
  return getFirestore().runTransaction(transaction => reopenTripPhaseInTransaction(transaction, uid, input));
}

export async function reopenTripPhaseInTransaction(
  transaction: Transaction,
  uid: string,
  input: ReopenTripPhaseInput,
) {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requireOwner(context);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    if (context.trip.phase === "FINALIZED") throw authError("INVALID_PHASE", "Finalized trips cannot be reopened.", { tripId: input.tripId });

    const state = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (state.activeOwnerId !== context.trip.ownerId) throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const targetPlanningCycle = context.trip.planningCycle + 1;

    if (input.targetPhase === "COLLECTING") {
      const candidateSnapshots = await transaction.get(tripRef.collection("candidates"));
      const submissionSnapshots = await transaction.get(tripRef.collection("submissions"));
      const candidates = candidateSnapshots.docs.map(snapshot => parseCandidate(snapshot.data(), snapshot.id, input.tripId));
      const submissions = submissionSnapshots.docs.map(snapshot => parseSubmission(snapshot.data(), snapshot.id, input.tripId));
      const candidateState = recalculateMembershipCandidateState({
        candidates: candidates.map(candidate => ({ candidateId: candidateIdFromPlaceId(candidate.placeId), active: candidate.active, activationVersion: candidate.activationVersion })),
        submissions: submissions.map(submission => ({ candidateId: submission.candidateId, memberId: submission.memberId, preference: submission.preference })),
        candidateVotes: [],
        activeMemberIds: state.activeMemberIds,
        planningCycle: targetPlanningCycle,
      });
      const shortlistPatches = resetMembershipShortlistState(candidates.map(candidate => ({
        candidateId: candidateIdFromPlaceId(candidate.placeId),
        shortlistStatus: candidate.shortlistStatus,
      })), true);
      const updates = new Map<string, Record<string, unknown>>();
      for (const patch of candidateState.deactivatePatches) updates.set(patch.candidateId, { active: false });
      for (const patch of shortlistPatches) updates.set(patch.candidateId, { ...(updates.get(patch.candidateId) ?? {}), shortlistStatus: patch.shortlistStatus });
      const updatedAt = FieldValue.serverTimestamp();
      for (const [candidateId, update] of updates) transaction.update(tripRef.collection("candidates").doc(candidateId), { ...update, updatedAt });
      transaction.update(tripRef, {
        phase: "COLLECTING",
        planningCycle: targetPlanningCycle,
        votingBasisMembershipVersion: FieldValue.delete(),
        selectedOptionId: FieldValue.delete(),
        updatedAt,
      });
      return reopenTripPhaseResultSchema.parse({ tripId: input.tripId, phase: "COLLECTING", planningCycle: targetPlanningCycle });
    }

    if (context.trip.phase === "COLLECTING") throw authError("INVALID_PHASE", "Use startVoting to enter VOTING from COLLECTING.", { tripId: input.tripId });
    if (!["VOTING", "PLANNING", "REVIEW"].includes(context.trip.phase)) throw authError("INVALID_PHASE", "This trip cannot reopen directly to VOTING.", { tripId: input.tripId });
    if (context.trip.votingBasisMembershipVersion === undefined) throw authError("INVALID_PHASE", "The current VOTING basis is missing; reopen through COLLECTING.", { tripId: input.tripId });
    if (context.trip.membershipVersion !== context.trip.votingBasisMembershipVersion) throw authError("STALE_MEMBERSHIP_VERSION", "Membership changed since the VOTING basis was established.", { tripId: input.tripId });
    if (state.activeMemberCount <= 1) throw authError("NOT_APPLICABLE_FOR_SOLO", "Voting is not applicable to a solo trip.", { tripId: input.tripId });

    const candidateSnapshots = await transaction.get(tripRef.collection("candidates").where("active", "==", true));
    const candidates = candidateSnapshots.docs.map(snapshot => parseCandidate(snapshot.data(), snapshot.id, input.tripId));
    if (!candidates.length) throw authError("NO_ACTIVE_CANDIDATES", "At least one active candidate is required.", { tripId: input.tripId });
    const voteSnapshots = await transaction.get(tripRef.collection("candidateVotes").where("planningCycle", "<", targetPlanningCycle));
    const historicalVotes = voteSnapshots.docs.map(snapshot => parseVote(snapshot.id, snapshot.data(), input.tripId));
    const carried = carryForwardCandidateVotes({
      votes: historicalVotes,
      targetPlanningCycle,
      activeMemberIds: state.activeMemberIds,
      candidates: candidates.map(candidate => ({ candidateId: candidateIdFromPlaceId(candidate.placeId), active: candidate.active, activationVersion: candidate.activationVersion })),
    });
    const shortlistPatches = resetMembershipShortlistState(candidates.map(candidate => ({
      candidateId: candidateIdFromPlaceId(candidate.placeId),
      shortlistStatus: candidate.shortlistStatus,
    })), true);
    const updatedAt = FieldValue.serverTimestamp();
    for (const vote of carried) {
      const record = { ...vote, createdAt: updatedAt, updatedAt };
      candidateVoteDocumentSchema.parse(record);
      transaction.create(tripRef.collection("candidateVotes").doc(candidateVoteId(vote.planningCycle, vote.candidateId, vote.memberId)), record);
    }
    for (const patch of shortlistPatches) transaction.update(tripRef.collection("candidates").doc(patch.candidateId), { shortlistStatus: patch.shortlistStatus, updatedAt });
    transaction.update(tripRef, {
      phase: "VOTING",
      planningCycle: targetPlanningCycle,
      votingBasisMembershipVersion: context.trip.membershipVersion,
      selectedOptionId: FieldValue.delete(),
      updatedAt,
    });
    return reopenTripPhaseResultSchema.parse({ tripId: input.tripId, phase: "VOTING", planningCycle: targetPlanningCycle });
}

export const reopenTripPhase = onCall({ enforceAppCheck: true }, reopenTripPhaseHandler);

function parseCandidate(data: unknown, snapshotId: string, tripId: string): CandidateDocument {
  const parsed = candidateDocumentSchema.safeParse(data);
  if (!parsed.success || candidateIdFromPlaceId(parsed.data.placeId) !== snapshotId) throw authError("CONFLICT", "Candidate state is invalid.", { tripId, targetId: snapshotId });
  return parsed.data;
}

function parseSubmission(data: unknown, snapshotId: string, tripId: string): SubmissionDocument {
  const parsed = submissionDocumentSchema.safeParse(data);
  if (!parsed.success || submissionIdForCandidate(parsed.data.memberId, parsed.data.candidateId) !== snapshotId) throw authError("CONFLICT", "Submission state is invalid.", { tripId, targetId: snapshotId });
  return parsed.data;
}

function parseVote(snapshotId: string, data: unknown, tripId: string): LegacyCandidateVoteDocument & { documentId: string } {
  const parsed = legacyCandidateVoteReadSchema.safeParse(data);
  if (!parsed.success || !isCandidateVoteIdentity(snapshotId, parsed.data)) throw authError("CONFLICT", "Candidate vote state is invalid.", { tripId, targetId: snapshotId });
  return { ...parsed.data, documentId: snapshotId };
}
