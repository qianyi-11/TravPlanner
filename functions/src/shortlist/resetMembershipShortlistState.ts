export interface MembershipShortlistCandidate {
  candidateId: string;
  shortlistStatus: "PENDING" | "SHORTLISTED" | "NOT_SHORTLISTED";
}

export function resetMembershipShortlistState(
  candidates: readonly MembershipShortlistCandidate[],
  reset: boolean,
): Array<{ candidateId: string; shortlistStatus: "PENDING" }> {
  if (!reset) return [];
  return candidates
    .filter(candidate => candidate.shortlistStatus !== "PENDING")
    .map(candidate => ({ candidateId: candidate.candidateId, shortlistStatus: "PENDING" as const }));
}
