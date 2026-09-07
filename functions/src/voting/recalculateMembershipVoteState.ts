import { aggregateCandidateVotes, type CandidateAggregationCandidate, type CandidateAggregationVote, type CandidateVoteAggregate } from "./candidateVoteAggregation";
import { calculateOptionPlurality, type OptionVoteForPlurality } from "./optionPlurality";

export type MembershipCandidateVote = CandidateAggregationVote;
export type MembershipOptionVote = OptionVoteForPlurality;
export type { CandidateVoteAggregate } from "./candidateVoteAggregation";

export interface MembershipVoteState {
  candidateAggregates: Record<string, CandidateVoteAggregate>;
  optionTotals: Record<string, number>;
  optionPlurality: {
    winnerOptionId?: string;
    tiedOptionIds: string[];
    isTie: boolean;
  };
}

export function recalculateMembershipVoteState(input: {
  candidateVotes: readonly MembershipCandidateVote[];
  optionVotes: readonly MembershipOptionVote[];
  activeMemberIds: readonly string[];
  planningCycle: number;
  candidates?: readonly CandidateAggregationCandidate[];
  eligibleOptionIds?: readonly string[];
}): MembershipVoteState {
  const eligibleOptionIds = input.eligibleOptionIds ?? [...new Set(input.optionVotes
    .filter(vote => vote.planningCycle === input.planningCycle)
    .map(vote => vote.optionId))];
  const plurality = calculateOptionPlurality({
    votes: input.optionVotes,
    activeMemberIds: input.activeMemberIds,
    eligibleOptionIds,
    planningCycle: input.planningCycle,
  });
  return {
    candidateAggregates: aggregateCandidateVotes({
      votes: input.candidateVotes,
      activeMemberIds: input.activeMemberIds,
      candidates: input.candidates,
      planningCycle: input.planningCycle,
    }),
    optionTotals: plurality.optionTotals,
    optionPlurality: {
      winnerOptionId: plurality.winnerOptionId,
      tiedOptionIds: plurality.tiedOptionIds,
      isTie: plurality.isTie,
    },
  };
}
