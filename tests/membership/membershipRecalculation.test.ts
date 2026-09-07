import { describe, expect, it } from "vitest";
import { recalculateMembershipCandidateState } from "../../functions/src/candidates/recalculateMembershipCandidateState";
import { recalculateSafeActivityBudgetCeiling } from "../../functions/src/budget/recalculateSafeActivityBudgetCeiling";
import { parseBudgetForMembership } from "../../functions/src/budget/parseBudgetForMembership";
import { resetMembershipShortlistState } from "../../functions/src/shortlist/resetMembershipShortlistState";
import { recalculateMembershipVoteState } from "../../functions/src/voting/recalculateMembershipVoteState";
import { recalculateMembershipApprovals } from "../../functions/src/review/recalculateMembershipApprovals";

describe("membership recalculation helpers", () => {
  it("keeps support only from active submissions and current-cycle WANT votes", () => {
    const result = recalculateMembershipCandidateState({
      candidates: [{ candidateId: "a", active: true }, { candidateId: "b", active: true }, { candidateId: "c", active: true }],
      submissions: [
        { candidateId: "a", memberId: "active", preference: "INTERESTED" },
        { candidateId: "b", memberId: "removed", preference: "MUST_DO" },
      ],
      candidateVotes: [
        { candidateId: "b", memberId: "active", value: "WANT", planningCycle: 2 },
        { candidateId: "c", memberId: "active", value: "NEUTRAL", planningCycle: 2 },
        { candidateId: "c", memberId: "active", value: "WANT", planningCycle: 1 },
      ],
      activeMemberIds: ["active"],
      planningCycle: 2,
    });

    expect(result.supportedCandidateIds).toEqual(["a", "b"]);
    expect(result.mustDoCandidateIds).toEqual([]);
    expect(result.deactivatePatches).toEqual([{ candidateId: "c", active: false }]);
  });

  it("only resets shortlist state when ordered to reopen", () => {
    const candidates = [
      { candidateId: "a", shortlistStatus: "SHORTLISTED" as const },
      { candidateId: "b", shortlistStatus: "PENDING" as const },
    ];
    expect(resetMembershipShortlistState(candidates, false)).toEqual([]);
    expect(resetMembershipShortlistState(candidates, true)).toEqual([{ candidateId: "a", shortlistStatus: "PENDING" }]);
  });

  it("filters votes and reports option ties without ranking candidates", () => {
    const result = recalculateMembershipVoteState({
      activeMemberIds: ["one", "two"],
      planningCycle: 2,
      candidateVotes: [
        { candidateId: "a", memberId: "one", value: "WANT", planningCycle: 2 },
        { candidateId: "a", memberId: "removed", value: "WANT", planningCycle: 2 },
        { candidateId: "b", memberId: "one", value: "AVOID", planningCycle: 1 },
      ],
      optionVotes: [
        { memberId: "one", planningCycle: 2, optionId: "x" },
        { memberId: "two", planningCycle: 2, optionId: "y" },
        { memberId: "removed", planningCycle: 2, optionId: "y" },
      ],
    });
    expect(result.candidateAggregates.a.scoreTotal).toBe(1);
    expect(result.candidateAggregates.b).toBeUndefined();
    expect(result.optionPlurality).toEqual({ winnerOptionId: undefined, tiedOptionIds: ["x", "y"], isTie: true });
  });

  it("derives group, solo, absent, inactive and old-currency budgets", () => {
    const base = { currency: "MYR", activeOwnerId: "owner" };
    expect(recalculateSafeActivityBudgetCeiling({ ...base, activeMemberIds: ["owner", "member"], budgets: [{ memberId: "owner", amount: 100, currency: "MYR" }, { memberId: "member", amount: 50, currency: "MYR" }, { memberId: "inactive", amount: 1, currency: "MYR" }] })).toBe(50);
    expect(recalculateSafeActivityBudgetCeiling({ ...base, activeMemberIds: ["owner"], budgets: [{ memberId: "owner", amount: 100, currency: "MYR" }] })).toBe(100);
    expect(recalculateSafeActivityBudgetCeiling({ ...base, activeMemberIds: ["owner"], budgets: [] })).toBeUndefined();
    expect(recalculateSafeActivityBudgetCeiling({ ...base, activeMemberIds: ["owner", "member"], budgets: [{ memberId: "member", amount: 50, currency: "USD" }] })).toBeUndefined();
    expect(recalculateSafeActivityBudgetCeiling({ ...base, activeMemberIds: ["owner"], budgets: [{ memberId: "owner", amount: 50, currency: "USD" }] })).toBeUndefined();
  });

  it("recomputes approval majority and can return resolved approval to pending", () => {
    const approvals = [{ approvalId: "approval", status: "APPROVED" as const, yesCount: 2, noCount: 0, responses: [
      { memberId: "owner", decision: "APPROVE" as const },
      { memberId: "member", decision: "APPROVE" as const },
    ] }];
    expect(recalculateMembershipApprovals({ approvals, activeMemberIds: ["owner", "member"] })[0]).toMatchObject({ status: "APPROVED", yesCount: 2, noCount: 0, requiredYesCount: 2, resolved: true });
    expect(recalculateMembershipApprovals({ approvals, activeMemberIds: ["owner", "other"] })[0]).toMatchObject({ status: "PENDING", yesCount: 1, noCount: 0, requiredYesCount: 2, resolved: false });
  });

  describe("membership flow budget parsing and recalculation", () => {
    it("handles join recalculation with validated budget reads", () => {
      const validBudgetDoc = {
        memberId: "u_existing",
        amount: 250,
        currency: "MYR",
        planningCycleUpdated: 1,
        updatedAt: 12345,
      };
      const parsed = parseBudgetForMembership(validBudgetDoc, "u_existing", "trip1");
      const ceiling = recalculateSafeActivityBudgetCeiling({
        budgets: [parsed],
        activeMemberIds: ["owner", "u_existing", "u_new"],
        activeOwnerId: "owner",
        currency: "MYR",
      });
      expect(ceiling).toBe(250);
    });

    it("handles removal recalculation with old-currency exclusion", () => {
      const myrBudget = parseBudgetForMembership(
        { memberId: "u1", amount: 300, currency: "MYR", planningCycleUpdated: 1, updatedAt: 12345 },
        "u1",
        "trip1"
      );
      const oldCurrencyBudget = parseBudgetForMembership(
        { memberId: "u2", amount: 100, currency: "USD", planningCycleUpdated: 1, updatedAt: 12345 },
        "u2",
        "trip1"
      );

      const postRemovalMemberIds = ["u1", "u2"];
      const ceiling = recalculateSafeActivityBudgetCeiling({
        budgets: [myrBudget, oldCurrencyBudget],
        activeMemberIds: postRemovalMemberIds,
        activeOwnerId: "u1",
        currency: "MYR",
      });
      expect(ceiling).toBe(300); // USD budget is excluded
    });

    it("throws CONFLICT on malformed budget in membership flow", () => {
      const malformedBudget = {
        memberId: "u1",
        amount: -50,
        currency: "MYR",
        planningCycleUpdated: 1,
        updatedAt: 12345,
      };
      expect(() => parseBudgetForMembership(malformedBudget, "u1", "trip1")).toThrowError(
        expect.objectContaining({ details: expect.objectContaining({ reason: "CONFLICT" }) })
      );
    });
  });
});
