import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  candidateVoteDocumentSchema,
  legacyCandidateVoteReadSchema,
  startVotingInputSchema,
  startVotingResultSchema,
  type CandidateDocument,
  type LegacyCandidateVoteDocument,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requireOwner,
  requirePhase,
  requirePlanningCycle,
} from "../auth";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";
import { candidateVoteId, isCandidateVoteIdentity } from "./candidateVoteIdentity";
import { carryForwardCandidateVotes } from "./carryForwardCandidateVotes";

export async function startVotingHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = startVotingInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Start-voting input is invalid.");
  const input = parsed.data;

  return getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requireOwner(context);
    requirePhase(context, ["COLLECTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    const state = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (state.activeOwnerId !== context.trip.ownerId) throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
    if (state.activeMemberCount <= 1) throw authError("NOT_APPLICABLE_FOR_SOLO", "Voting is not applicable to a solo trip.", { tripId: input.tripId });

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const candidateSnapshots = await transaction.get(tripRef.collection("candidates").where("active", "==", true));
    const candidates = candidateSnapshots.docs.map(snapshot => parseCandidate(snapshot.data(), snapshot.id, input.tripId));
    if (!candidates.length) throw authError("NO_ACTIVE_CANDIDATES", "At least one active candidate is required.", { tripId: input.tripId });

    const voteSnapshots = await transaction.get(
      tripRef.collection("candidateVotes").where("planningCycle", "<", context.trip.planningCycle),
    );
    const historicalVotes = voteSnapshots.docs.map(snapshot => parseVote(snapshot.id, snapshot.data(), input.tripId));
    const carried = carryForwardCandidateVotes({
      votes: historicalVotes,
      targetPlanningCycle: context.trip.planningCycle,
      activeMemberIds: state.activeMemberIds,
      candidates: candidates.map(candidate => ({ candidateId: candidateIdFromPlaceId(candidate.placeId), active: candidate.active, activationVersion: candidate.activationVersion })),
    });

    const timestamp = FieldValue.serverTimestamp();
    for (const vote of carried) {
      const record = {
        ...vote,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      candidateVoteDocumentSchema.parse(record);
      transaction.create(tripRef.collection("candidateVotes").doc(candidateVoteId(vote.planningCycle, vote.candidateId, vote.memberId)), record);
    }
    transaction.update(tripRef, {
      phase: "VOTING",
      votingBasisMembershipVersion: context.trip.membershipVersion,
      updatedAt: timestamp,
    });
    return startVotingResultSchema.parse({ phase: "VOTING", planningCycle: context.trip.planningCycle });
  });
}

export const startVoting = onCall({ enforceAppCheck: true }, startVotingHandler);

function parseCandidate(data: unknown, snapshotId: string, tripId: string): CandidateDocument {
  const parsed = candidateDocumentSchema.safeParse(data);
  if (!parsed.success || candidateIdFromPlaceId(parsed.data.placeId) !== snapshotId) {
    throw authError("CONFLICT", "Candidate state is invalid.", { tripId, targetId: snapshotId });
  }
  return parsed.data;
}

function parseVote(snapshotId: string, data: unknown, tripId: string): LegacyCandidateVoteDocument & { documentId: string } {
  const parsed = legacyCandidateVoteReadSchema.safeParse(data);
  if (!parsed.success || !isCandidateVoteIdentity(snapshotId, parsed.data)) {
    throw authError("CONFLICT", "Candidate vote state is invalid.", { tripId, targetId: snapshotId });
  }
  return { ...parsed.data, documentId: snapshotId };
}
