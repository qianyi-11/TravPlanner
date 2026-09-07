export interface CandidateVoteIdentity {
  candidateId: string;
  memberId: string;
  planningCycle: number;
}

export function candidateVoteId(planningCycle: number, candidateId: string, memberId: string): string {
  return `${planningCycle}_${candidateId}_${memberId}`;
}

export function isCandidateVoteIdentity(snapshotId: string, vote: CandidateVoteIdentity): boolean {
  return snapshotId === candidateVoteId(vote.planningCycle, vote.candidateId, vote.memberId);
}

export function validateCandidateVoteIdentity(snapshotId: string, vote: CandidateVoteIdentity): void {
  if (!isCandidateVoteIdentity(snapshotId, vote)) throw new Error("Candidate vote identity is invalid.");
}
