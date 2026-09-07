export interface MembershipActivityBudget {
  memberId: string;
  amount: number;
  currency: string;
}

export function recalculateSafeActivityBudgetCeiling(input: {
  budgets: readonly MembershipActivityBudget[];
  activeMemberIds: readonly string[];
  activeOwnerId: string;
  currency: string;
}): number | undefined {
  const isSolo = input.activeMemberIds.length === 1
    && input.activeMemberIds[0] === input.activeOwnerId;

  const applicableMemberIds = isSolo
    ? [input.activeOwnerId]
    : input.activeMemberIds;

  const applicableAmounts = input.budgets
    .filter(budget =>
      applicableMemberIds.includes(budget.memberId)
      && budget.currency === input.currency
    )
    .map(budget => budget.amount);

  return applicableAmounts.length === 0 ? undefined : Math.min(...applicableAmounts);
}
