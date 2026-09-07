import type { ShortlistCandidateInput } from "./types";

function scoreOf(candidate: ShortlistCandidateInput): number {
  return candidate.voteAggregate?.scoreTotal ?? 0;
}

export function rankGroupOrdinaryCandidates(
  candidates: readonly ShortlistCandidateInput[],
): ShortlistCandidateInput[] {
  return candidates
    .filter(candidate => !candidate.mustDo)
    .slice()
    .sort((left, right) => {
      const scoreDifference = scoreOf(right) - scoreOf(left);
      return scoreDifference !== 0
        ? scoreDifference
        : left.candidateId.localeCompare(right.candidateId);
    });
}

export function rankSoloOrdinaryCandidates(
  candidates: readonly ShortlistCandidateInput[],
): ShortlistCandidateInput[] {
  return candidates
    .filter(candidate => !candidate.mustDo)
    .slice()
    .sort((left, right) => {
      const leftComplete = left.factCompleteness === "COMPLETE";
      const rightComplete = right.factCompleteness === "COMPLETE";
      if (leftComplete !== rightComplete) return leftComplete ? -1 : 1;

      const leftKnownTravel = left.representativeTravelMinutes !== undefined;
      const rightKnownTravel = right.representativeTravelMinutes !== undefined;
      if (leftKnownTravel !== rightKnownTravel) return leftKnownTravel ? -1 : 1;

      if (leftKnownTravel && rightKnownTravel) {
        const travelDifference =
          (left.representativeTravelMinutes as number) -
          (right.representativeTravelMinutes as number);
        if (travelDifference !== 0) return travelDifference;
      }

      return left.candidateId.localeCompare(right.candidateId);
    });
}
