import {
  effectiveCandidateActivationVersion,
  effectiveVoteCandidateActivationVersion,
  type LegacyCandidateVoteDocument,
} from "@travel-planner/shared";
import { candidateVoteScore } from "./candidateVoteAggregation";

export interface CarryCandidate {
  candidateId: string;
  active: boolean;
  activationVersion?: number;
}

export interface CarryCandidateVote extends Pick<LegacyCandidateVoteDocument, "candidateId" | "memberId" | "value" | "planningCycle"> {
  candidateActivationVersion?: number;
  documentId?: string;
}

export interface CarriedCandidateVote {
  candidateId: string;
  memberId: string;
  value: CarryCandidateVote["value"];
  score: -1 | 0 | 1;
  planningCycle: number;
  candidateActivationVersion: number;
}

export function carryForwardCandidateVotes(input: {
  votes: readonly CarryCandidateVote[];
  targetPlanningCycle: number;
  activeMemberIds: readonly string[];
  candidates: readonly CarryCandidate[];
}): CarriedCandidateVote[] {
  const activeMembers = new Set(input.activeMemberIds);
  const candidates = new Map(input.candidates.map(candidate => [candidate.candidateId, candidate]));
  const latest = new Map<string, CarryCandidateVote>();
  for (const vote of input.votes) {
    const candidate = candidates.get(vote.candidateId);
    if (vote.planningCycle >= input.targetPlanningCycle ||
      !activeMembers.has(vote.memberId) ||
      candidate?.active !== true ||
      effectiveVoteCandidateActivationVersion(vote) !== effectiveCandidateActivationVersion(candidate)) continue;
    const key = `${vote.candidateId}\u0000${vote.memberId}`;
    const previous = latest.get(key);
    if (!previous || vote.planningCycle > previous.planningCycle ||
      (vote.planningCycle === previous.planningCycle && (vote.documentId ?? "") > (previous.documentId ?? ""))) latest.set(key, vote);
  }
  return [...latest.values()]
    .map(vote => ({
      candidateId: vote.candidateId,
      memberId: vote.memberId,
      value: vote.value,
      score: candidateVoteScore(vote.value),
      planningCycle: input.targetPlanningCycle,
      candidateActivationVersion: effectiveCandidateActivationVersion(candidates.get(vote.candidateId)! ),
    }))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId) || left.memberId.localeCompare(right.memberId));
}
