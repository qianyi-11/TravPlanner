import { describe, expect, it } from "vitest";
import { evaluateMembershipImpact } from "../../functions/src/membership/evaluateMembershipImpact";

const base = {
  planningCycle: 2,
  activeMemberCountBefore: 2,
  activeMemberCountAfter: 1,
  hasCurrentCycleOptions: false,
  hasCurrentCycleReviewArtifact: false,
  candidateSupportChanged: false,
  mustDoSetChanged: false,
  candidateAffectsCurrentArtifacts: false,
  optionOutcomeChanged: false,
  approvalStateChanged: false,
};

describe("membership impact", () => {
  it.each([
    ["COLLECTING", "COLLECTING", 2, false],
    ["VOTING", "COLLECTING", 3, true],
    ["PLANNING", "COLLECTING", 3, true],
    ["REVIEW", "COLLECTING", 3, true],
    ["FINALIZED", "FINALIZED", 2, false],
  ] as const)("handles %s", (phase, nextPhase, cycle, reopened) => {
    expect(evaluateMembershipImpact({ ...base, phase }).nextPhase).toBe(nextPhase);
    expect(evaluateMembershipImpact({ ...base, phase })).toMatchObject({ nextPlanningCycle: cycle, workflowReopened: reopened });
  });

  it("keeps planning open without options and reopens only for material dependencies", () => {
    expect(evaluateMembershipImpact({ ...base, phase: "PLANNING", candidateSupportChanged: true, candidateAffectsCurrentArtifacts: true })).toMatchObject({ workflowReopened: true, materialImpact: true });
    expect(evaluateMembershipImpact({ ...base, phase: "PLANNING", hasCurrentCycleOptions: true, candidateSupportChanged: true, candidateAffectsCurrentArtifacts: true })).toMatchObject({ workflowReopened: true, nextPlanningCycle: 3, clearSelectedOptionId: true, resetShortlist: true });
  });

  it("uses stable unique reason ordering and ignores ceiling/score-only changes", () => {
    const result = evaluateMembershipImpact({ ...base, phase: "REVIEW", hasCurrentCycleOptions: true, candidateSupportChanged: true, mustDoSetChanged: true, candidateAffectsCurrentArtifacts: true, optionOutcomeChanged: true, approvalStateChanged: true });
    expect(result.impactReasonCodes).toEqual(["GROUP_BECAME_SOLO", "CANDIDATE_SUPPORT_CHANGED", "MUST_DO_SET_CHANGED", "OPTION_OUTCOME_CHANGED", "APPROVAL_STATE_CHANGED"]);
    expect(evaluateMembershipImpact({ ...base, phase: "REVIEW", activeMemberCountBefore: 1, activeMemberCountAfter: 1 }).materialImpact).toBe(false);
  });

  it("uses only an authoritative budget dependency signal for budget materiality", () => {
    expect(evaluateMembershipImpact({ ...base, phase: "REVIEW", activeMemberCountBefore: 1, activeMemberCountAfter: 1, budgetDependencyChanged: true })).toMatchObject({
      materialImpact: true,
      impactReasonCodes: ["BUDGET_DEPENDENCY_CHANGED"],
    });
  });
});
