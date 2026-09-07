import { describe, expect, it } from "vitest";
import { recalculateSafeActivityBudgetCeiling } from "../../functions/src/budget/recalculateSafeActivityBudgetCeiling";

describe("recalculateSafeActivityBudgetCeiling", () => {
  it("computes group minimum ceiling across active members in matching currency", () => {
    const ceiling = recalculateSafeActivityBudgetCeiling({
      budgets: [
        { memberId: "u1", amount: 500, currency: "USD" },
        { memberId: "u2", amount: 300, currency: "USD" },
        { memberId: "u3", amount: 400, currency: "USD" },
      ],
      activeMemberIds: ["u1", "u2", "u3"],
      activeOwnerId: "u1",
      currency: "USD",
    });
    expect(ceiling).toBe(300);
  });

  it("computes solo OWNER ceiling", () => {
    const ceiling = recalculateSafeActivityBudgetCeiling({
      budgets: [{ memberId: "u1", amount: 450, currency: "USD" }],
      activeMemberIds: ["u1"],
      activeOwnerId: "u1",
      currency: "USD",
    });
    expect(ceiling).toBe(450);
  });

  it("ignores inactive members", () => {
    const ceiling = recalculateSafeActivityBudgetCeiling({
      budgets: [
        { memberId: "u1", amount: 500, currency: "USD" },
        { memberId: "u2_removed", amount: 100, currency: "USD" },
      ],
      activeMemberIds: ["u1"],
      activeOwnerId: "u1",
      currency: "USD",
    });
    expect(ceiling).toBe(500);
  });

  it("ignores old-currency records", () => {
    const ceiling = recalculateSafeActivityBudgetCeiling({
      budgets: [
        { memberId: "u1", amount: 500, currency: "EUR" },
        { memberId: "u2", amount: 300, currency: "USD" },
      ],
      activeMemberIds: ["u1", "u2"],
      activeOwnerId: "u1",
      currency: "USD",
    });
    expect(ceiling).toBe(300);
  });

  it("imposes no zero ceiling when members have not set budgets", () => {
    const ceiling = recalculateSafeActivityBudgetCeiling({
      budgets: [],
      activeMemberIds: ["u1", "u2"],
      activeOwnerId: "u1",
      currency: "USD",
    });
    expect(ceiling).toBeUndefined();
  });

  it("returns undefined when no budgets match current currency", () => {
    const ceiling = recalculateSafeActivityBudgetCeiling({
      budgets: [
        { memberId: "u1", amount: 500, currency: "EUR" },
        { memberId: "u2", amount: 300, currency: "GBP" },
      ],
      activeMemberIds: ["u1", "u2"],
      activeOwnerId: "u1",
      currency: "USD",
    });
    expect(ceiling).toBeUndefined();
  });
});
