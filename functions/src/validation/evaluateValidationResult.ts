import {
  validationHardCheckSchema,
  type ValidationCheck,
  type ValidationHardCheck,
} from "@travel-planner/shared";
import { orderValidationHardChecks, orderValidationReasonCodes } from "./validationOrdering";
import type { ValidationEvaluation } from "./types";

const NON_BLOCKING_CONFIRMATION_CHECKS = new Set<ValidationCheck>([
  "ACTIVITY_BUDGET",
  "PRICE",
]);

export function evaluateValidationResult(
  hardChecks: readonly ValidationHardCheck[],
): ValidationEvaluation {
  const parsedChecks = hardChecks.map(check => validationHardCheckSchema.parse(check));
  const checkIds = parsedChecks.map(check => check.check);

  if (new Set(checkIds).size !== checkIds.length) {
    throw new RangeError("Validation hardChecks must not contain duplicate checks");
  }

  const orderedChecks = orderValidationHardChecks(parsedChecks);
  const reasonCodes = orderValidationReasonCodes([
    ...new Set(
      orderedChecks.flatMap(check =>
        (check.status === "FAIL" || check.status === "NEEDS_CONFIRMATION") && check.reasonCode
          ? [check.reasonCode]
          : [],
      ),
    ),
  ]);

  if (orderedChecks.some(check => check.status === "FAIL")) {
    return {
      result: "INVALID",
      schedulable: false,
      reasonCodes,
      hardChecks: orderedChecks,
    };
  }

  const unresolvedChecks = orderedChecks.filter(
    check => check.status === "NEEDS_CONFIRMATION",
  );
  if (unresolvedChecks.length > 0) {
    return {
      result: "NEEDS_CONFIRMATION",
      schedulable: unresolvedChecks.every(check =>
        NON_BLOCKING_CONFIRMATION_CHECKS.has(check.check)
      ),
      reasonCodes,
      hardChecks: orderedChecks,
    };
  }

  return {
    result: "VALID",
    schedulable: true,
    reasonCodes,
    hardChecks: orderedChecks,
  };
}
