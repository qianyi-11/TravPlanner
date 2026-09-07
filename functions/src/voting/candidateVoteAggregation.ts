import {
  effectiveCandidateActivationVersion,
  effectiveVoteCandidateActivationVersion,
  type LegacyCandidateVoteDocument,
} from "@travel-planner/shared";

export interface CandidateAggregationCandidate {
  candidateId: string;
  active: boolean;
  activationVersion?: number;
}

export interface CandidateAggregationVote extends Pick<LegacyCandidateVoteDocument, "candidateId" | "memberId" | "value" | "planningCycle"> {
  candidateActivationVersion?: number;
}

export interface CandidateVoteAggregate {
  scoreTotal: number;
  responseCount: number;
  wantCount: number;
  neutralCount: number;
  avoidCount: number;
}

export function candidateVoteScore(value: CandidateAggregationVote["value"]): -1 | 0 | 1 {
  return value === "WANT" ? 1 : value === "AVOID" ? -1 : 0;
}

export function eligibleCandidateVotes(input: {
  votes: readonly CandidateAggregationVote[];
  activeMemberIds: readonly string[];
  candidates?: readonly CandidateAggregationCandidate[];
  planningCycle: number;
}): CandidateAggregationVote[] {
  const activeMembers = new Set(input.activeMemberIds);
  const candidates: CandidateAggregationCandidate[] = input.candidates
    ? [...input.candidates]
    : [...new Set(input.votes.map(vote => vote.candidateId))].map(candidateId => ({ candidateId, active: true, activationVersion: 1 }));
  const candidateMap = new Map(candidates.map(candidate => [candidate.candidateId, candidate]));
  return input.votes.filter(vote => {
    const candidate = candidateMap.get(vote.candidateId);
    return vote.planningCycle === input.planningCycle &&
      activeMembers.has(vote.memberId) &&
      candidate?.active === true &&
      effectiveVoteCandidateActivationVersion(vote) === effectiveCandidateActivationVersion(candidate);
  });
}

export function aggregateCandidateVotes(input: {
  votes: readonly CandidateAggregationVote[];
  activeMemberIds: readonly string[];
  candidates?: readonly CandidateAggregationCandidate[];
  planningCycle: number;
}): Record<string, CandidateVoteAggregate> {
  const aggregates: Record<string, CandidateVoteAggregate> = {};
  for (const vote of eligibleCandidateVotes(input).sort((left, right) => left.candidateId.localeCompare(right.candidateId))) {
    const aggregate = aggregates[vote.candidateId] ??= { scoreTotal: 0, responseCount: 0, wantCount: 0, neutralCount: 0, avoidCount: 0 };
    aggregate.scoreTotal += candidateVoteScore(vote.value);
    aggregate.responseCount += 1;
    if (vote.value === "WANT") aggregate.wantCount += 1;
    else if (vote.value === "NEUTRAL") aggregate.neutralCount += 1;
    else aggregate.avoidCount += 1;
  }
  return Object.fromEntries(Object.entries(aggregates).sort(([left], [right]) => left.localeCompare(right)));
}
