import type { CandidateVoteAggregate } from "../voting/candidateVoteAggregation";

export type ShortlistFactCompleteness = "COMPLETE" | "INCOMPLETE";

export interface ShortlistCandidateInput {
  candidateId: string;
  mustDo: boolean;
  expectedDurationMinutes?: number;
  representativeTravelMinutes?: number;
  factCompleteness?: ShortlistFactCompleteness;
  voteAggregate?: CandidateVoteAggregate;
}

export interface ShortlistCapacityResult {
  totalUsableMinutes: number;
  medianCandidateDuration?: number;
  medianRepresentativeTravelMinutes?: number;
  estimatedSlots?: number;
  detailedValidationTarget?: number;
  ordinaryCapacity: number;
  usedZeroTravelFallback: boolean;
  missingDurationMedian: boolean;
}

export interface ShortlistCalculationResult {
  orderedSelectedCandidateIds: string[];
  selectedCandidateIds: Set<string>;
  eligibleCandidateIds: string[];
  ordinaryRankedCandidateIds: string[];
  mustDoCandidateIds: string[];
  capacity: ShortlistCapacityResult;
}

export interface ShortlistStatusPatch {
  candidateId: string;
  shortlistStatus: "SHORTLISTED" | "NOT_SHORTLISTED";
}
