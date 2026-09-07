import { eligibleCandidateVotes } from "../voting/candidateVoteAggregation";

export interface MembershipCandidateRecord {
  candidateId: string;
  active: boolean;
  activationVersion?: number;
}

export interface MembershipSubmissionRecord {
  candidateId: string;
  memberId: string;
  preference: "INTERESTED" | "MUST_DO";
}

export interface MembershipCandidateVoteRecord {
  candidateId: string;
  memberId: string;
  value: "WANT" | "NEUTRAL" | "AVOID";
  planningCycle: number;
  candidateActivationVersion?: number;
}

export interface MembershipCandidateStateInput {
  candidates: readonly MembershipCandidateRecord[];
  submissions: readonly MembershipSubmissionRecord[];
  candidateVotes: readonly MembershipCandidateVoteRecord[];
  activeMemberIds: readonly string[];
  planningCycle: number;
}

export interface MembershipCandidateState {
  supportedCandidateIds: string[];
  mustDoCandidateIds: string[];
  deactivatePatches: Array<{ candidateId: string; active: false }>;
}

export function recalculateMembershipCandidateState(
  input: MembershipCandidateStateInput,
): MembershipCandidateState {
  const activeMembers = new Set(input.activeMemberIds);
  const supported = new Set<string>();
  const mustDo = new Set<string>();

  for (const submission of input.submissions) {
    if (!activeMembers.has(submission.memberId)) continue;
    if (submission.preference === "INTERESTED" || submission.preference === "MUST_DO") {
      supported.add(submission.candidateId);
    }
    if (submission.preference === "MUST_DO") mustDo.add(submission.candidateId);
  }

  for (const vote of eligibleCandidateVotes({
    votes: input.candidateVotes,
    activeMemberIds: input.activeMemberIds,
    candidates: input.candidates,
    planningCycle: input.planningCycle,
  })) {
    if (vote.value === "WANT") {
      supported.add(vote.candidateId);
    }
  }

  return {
    supportedCandidateIds: [...supported],
    mustDoCandidateIds: [...mustDo],
    deactivatePatches: input.candidates
      .filter(candidate => candidate.active && !supported.has(candidate.candidateId))
      .map(candidate => ({ candidateId: candidate.candidateId, active: false })),
  };
}
