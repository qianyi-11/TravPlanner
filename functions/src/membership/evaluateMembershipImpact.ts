import type { MembershipImpactReasonCode, TripPhase } from "@travel-planner/shared";

export interface MembershipImpactFacts {
  phase: TripPhase;
  planningCycle: number;
  activeMemberCountBefore: number;
  activeMemberCountAfter: number;
  hasCurrentCycleOptions: boolean;
  hasCurrentCycleReviewArtifact: boolean;
  candidateSupportChanged: boolean;
  mustDoSetChanged: boolean;
  candidateAffectsCurrentArtifacts: boolean;
  shortlistChanged?: boolean;
  optionOutcomeChanged: boolean;
  approvalStateChanged: boolean;
  budgetDependencyChanged?: boolean;
}

export interface MembershipImpactDecision {
  materialImpact: boolean;
  impactReasonCodes: MembershipImpactReasonCode[];
  workflowReopened: boolean;
  nextPhase: TripPhase;
  nextPlanningCycle: number;
  clearSelectedOptionId: boolean;
  resetShortlist: boolean;
}

export function evaluateMembershipImpact(
  facts: MembershipImpactFacts,
): MembershipImpactDecision {
  const groupBecameSolo = facts.activeMemberCountBefore > 1 && facts.activeMemberCountAfter === 1;
  const candidateChanged = facts.candidateSupportChanged || facts.mustDoSetChanged;
  const candidateMaterial = candidateChanged && facts.candidateAffectsCurrentArtifacts;
  const optionMaterial = facts.optionOutcomeChanged && (
    facts.hasCurrentCycleOptions || facts.hasCurrentCycleReviewArtifact
  );
  const approvalMaterial = facts.approvalStateChanged && facts.phase === "REVIEW";
  const groupToSoloMaterial = groupBecameSolo && facts.phase !== "COLLECTING" && facts.phase !== "FINALIZED";
  const shortlistMaterial = facts.shortlistChanged === true;
  const budgetMaterial = facts.budgetDependencyChanged === true;
  const materialImpact = groupToSoloMaterial || candidateMaterial || shortlistMaterial || optionMaterial || budgetMaterial || approvalMaterial;
  const impactReasonCodes: MembershipImpactReasonCode[] = [];

  if (groupBecameSolo) impactReasonCodes.push("GROUP_BECAME_SOLO");
  if (facts.candidateSupportChanged && facts.candidateAffectsCurrentArtifacts) {
    impactReasonCodes.push("CANDIDATE_SUPPORT_CHANGED");
  }
  if (facts.mustDoSetChanged && facts.candidateAffectsCurrentArtifacts) {
    impactReasonCodes.push("MUST_DO_SET_CHANGED");
  }
  if (facts.shortlistChanged) impactReasonCodes.push("SHORTLIST_CHANGED");
  if (facts.optionOutcomeChanged && (facts.hasCurrentCycleOptions || facts.hasCurrentCycleReviewArtifact)) {
    impactReasonCodes.push("OPTION_OUTCOME_CHANGED");
  }
  if (budgetMaterial) impactReasonCodes.push("BUDGET_DEPENDENCY_CHANGED");
  if (facts.approvalStateChanged) impactReasonCodes.push("APPROVAL_STATE_CHANGED");

  const workflowReopened = facts.phase === "VOTING"
    ? groupToSoloMaterial
    : facts.phase === "PLANNING"
      ? groupToSoloMaterial || (facts.hasCurrentCycleOptions && materialImpact)
      : facts.phase === "REVIEW"
        ? materialImpact
        : false;
  const nextPhase = workflowReopened ? "COLLECTING" : facts.phase;
  const nextPlanningCycle = workflowReopened
    ? facts.planningCycle + 1
    : facts.planningCycle;

  return {
    materialImpact,
    impactReasonCodes,
    workflowReopened,
    nextPhase,
    nextPlanningCycle,
    clearSelectedOptionId: workflowReopened,
    resetShortlist: workflowReopened,
  };
}
