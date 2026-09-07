import {
  VALIDATION_CHECKS,
  VALIDATION_REASON_CODES,
  type ValidationCheck,
  type ValidationHardCheck,
  type ValidationReasonCode,
} from "@travel-planner/shared";

const VALIDATION_CHECK_ORDER: ReadonlyMap<ValidationCheck, number> = new Map(
  VALIDATION_CHECKS.map((check, index) => [check, index] as const),
);

const VALIDATION_REASON_ORDER: ReadonlyMap<ValidationReasonCode, number> = new Map(
  VALIDATION_REASON_CODES.map((reasonCode, index) => [reasonCode, index] as const),
);

export function orderValidationHardChecks(
  hardChecks: readonly ValidationHardCheck[],
): ValidationHardCheck[] {
  return [...hardChecks].sort(
    (left, right) =>
      VALIDATION_CHECK_ORDER.get(left.check)! - VALIDATION_CHECK_ORDER.get(right.check)!,
  );
}

export function orderValidationReasonCodes(
  reasonCodes: readonly ValidationReasonCode[],
): ValidationReasonCode[] {
  return [...reasonCodes].sort(
    (left, right) =>
      VALIDATION_REASON_ORDER.get(left)! - VALIDATION_REASON_ORDER.get(right)!,
  );
}
