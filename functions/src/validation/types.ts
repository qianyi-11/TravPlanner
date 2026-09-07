import type {
  ValidationHardCheck,
  ValidationReasonCode,
  ValidationResult,
} from "@travel-planner/shared";

/** Destination-local same-day interval using half-open [startMinute, endMinute). */
export interface SameDayInterval {
  date: string;
  startMinute: number;
  endMinute: number;
}

export interface ValidationEvaluation {
  result: ValidationResult;
  schedulable: boolean;
  reasonCodes: ValidationReasonCode[];
  hardChecks: ValidationHardCheck[];
}
