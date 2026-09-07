import { calculateShortlistCapacity } from "./capacity";
import { rankGroupOrdinaryCandidates, rankSoloOrdinaryCandidates } from "./ranking";
import type { ShortlistCalculationResult, ShortlistCandidateInput, ShortlistStatusPatch } from "./types";

function mustDoCandidates(candidates: readonly ShortlistCandidateInput[]): ShortlistCandidateInput[] {
  return candidates.filter(candidate => candidate.mustDo).slice().sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

export function calculateShortlist(input: {
  mode: "GROUP" | "SOLO";
  candidates: readonly ShortlistCandidateInput[];
  totalUsableMinutes: number;
}): ShortlistCalculationResult {
  const eligible = [...input.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const mustDo = mustDoCandidates(eligible);
  const ordinary = input.mode === "GROUP" ? rankGroupOrdinaryCandidates(eligible) : rankSoloOrdinaryCandidates(eligible);
  const capacity = calculateShortlistCapacity({
    totalUsableMinutes: input.totalUsableMinutes,
    expectedDurations: eligible.flatMap(candidate => candidate.expectedDurationMinutes === undefined ? [] : [candidate.expectedDurationMinutes]),
    representativeTravelMinutes: eligible.flatMap(candidate => candidate.representativeTravelMinutes === undefined ? [] : [candidate.representativeTravelMinutes]),
    mustDoCount: mustDo.length,
  });
  if (capacity.missingDurationMedian && !capacity.usedZeroTravelFallback) {
    throw new RangeError("Shortlist capacity requires at least one authoritative expected duration when travel proxies are available");
  }
  const selectedOrdinary = ordinary.slice(0, capacity.ordinaryCapacity);
  const orderedSelectedCandidateIds = [...mustDo.map(candidate => candidate.candidateId), ...selectedOrdinary.map(candidate => candidate.candidateId)];
  const selectedCandidateIds = new Set(orderedSelectedCandidateIds);
  return {
    orderedSelectedCandidateIds,
    selectedCandidateIds,
    eligibleCandidateIds: eligible.map(candidate => candidate.candidateId),
    ordinaryRankedCandidateIds: ordinary.map(candidate => candidate.candidateId),
    mustDoCandidateIds: mustDo.map(candidate => candidate.candidateId),
    capacity,
  };
}

export function shortlistStatusPatches(calculation: ShortlistCalculationResult): ShortlistStatusPatch[] {
  return calculation.eligibleCandidateIds.map(candidateId => ({
    candidateId,
    shortlistStatus: calculation.selectedCandidateIds.has(candidateId) ? "SHORTLISTED" : "NOT_SHORTLISTED",
  }));
}
