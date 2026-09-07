import { activityBudgetReadSchema } from "@travel-planner/shared";
import { authError } from "../auth";
import type { MembershipActivityBudget } from "./recalculateSafeActivityBudgetCeiling";

export function parseBudgetForMembership(
  data: unknown,
  documentId: string,
  tripId: string,
): MembershipActivityBudget {
  const parsed = activityBudgetReadSchema.safeParse(data);
  if (!parsed.success) {
    throw authError("CONFLICT", "Activity budget state is malformed.", {
      tripId,
      targetId: documentId,
    });
  }
  if (parsed.data.memberId !== documentId) {
    throw authError("CONFLICT", "Activity budget member ID is inconsistent.", {
      tripId,
      targetId: documentId,
    });
  }
  return {
    memberId: parsed.data.memberId,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
  };
}
