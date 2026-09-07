import type {
  CostStatus,
  ValidationHardCheck,
} from "@travel-planner/shared";
import { sumExactMinorUnits, toExactMinorUnits } from "./money";

export function evaluateActivityBudgetCheck(input: {
  currency: string;
  safeActivityBudgetCeiling?: number;
  knownActivityAmounts: readonly number[];
}): ValidationHardCheck {
  if (input.safeActivityBudgetCeiling === undefined) {
    return { check: "ACTIVITY_BUDGET", status: "NOT_APPLICABLE" };
  }

  const totalMinorUnits = sumExactMinorUnits(input.knownActivityAmounts, input.currency);
  const ceilingMinorUnits = toExactMinorUnits(
    input.safeActivityBudgetCeiling,
    input.currency,
  );

  if (totalMinorUnits === null || ceilingMinorUnits === null) {
    throw new RangeError(
      "Activity Budget feasibility received unsupported currency or invalid monetary precision",
    );
  }

  return totalMinorUnits <= ceilingMinorUnits
    ? { check: "ACTIVITY_BUDGET", status: "PASS" }
    : {
        check: "ACTIVITY_BUDGET",
        status: "FAIL",
        reasonCode: "ACTIVITY_BUDGET_EXCEEDED",
      };
}

export function evaluatePriceCheck(costStatus: CostStatus): ValidationHardCheck {
  return costStatus === "UNKNOWN"
    ? {
        check: "PRICE",
        status: "NEEDS_CONFIRMATION",
        reasonCode: "PRICE_UNKNOWN",
      }
    : { check: "PRICE", status: "PASS" };
}
