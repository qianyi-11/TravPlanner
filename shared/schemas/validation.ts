import { z } from "zod";
import {
  VALIDATION_CHECK_STATUSES,
  VALIDATION_CHECKS,
  VALIDATION_REASON_CODES,
  VALIDATION_RESULTS,
  VALIDATION_SCOPES,
} from "../enums";
import { firestoreTimestampSchema } from "./common";

const NON_BLOCKING_CONFIRMATION_CHECKS = new Set([
  "ACTIVITY_BUDGET",
  "PRICE",
] as const);

export const validationHardCheckSchema = z.object({
  check: z.enum(VALIDATION_CHECKS),
  status: z.enum(VALIDATION_CHECK_STATUSES),
  reasonCode: z.enum(VALIDATION_REASON_CODES).optional(),
}).strict().superRefine((value, ctx) => {
  const requiresReason = value.status === "FAIL" || value.status === "NEEDS_CONFIRMATION";

  if (requiresReason && value.reasonCode === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasonCode"],
      message: `${value.status} hard checks require a reasonCode`,
    });
  }

  if (!requiresReason && value.reasonCode !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasonCode"],
      message: `${value.status} hard checks must not carry a reasonCode`,
    });
  }
});

export const validationSnapshotDocumentSchema = z.object({
  planningCycle: z.number().int().positive(),
  scope: z.enum(VALIDATION_SCOPES),
  targetId: z.string().min(1),
  result: z.enum(VALIDATION_RESULTS),
  schedulable: z.boolean(),
  reasonCodes: z.array(z.enum(VALIDATION_REASON_CODES)),
  hardChecks: z.array(validationHardCheckSchema),
  externalSnapshotIds: z.array(z.string().min(1)),
  checkedAt: firestoreTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (new Set(value.reasonCodes).size !== value.reasonCodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasonCodes"],
      message: "Validation reasonCodes must be unique",
    });
  }

  const hardCheckIds = value.hardChecks.map(check => check.check);
  if (new Set(hardCheckIds).size !== hardCheckIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hardChecks"],
      message: "Validation hardChecks must not contain duplicate checks",
    });
  }

  if (new Set(value.externalSnapshotIds).size !== value.externalSnapshotIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalSnapshotIds"],
      message: "Validation externalSnapshotIds must be unique",
    });
  }

  const hasFail = value.hardChecks.some(check => check.status === "FAIL");
  const unresolvedChecks = value.hardChecks.filter(
    check => check.status === "NEEDS_CONFIRMATION",
  );
  const hasNeedsConfirmation = unresolvedChecks.length > 0;

  if (value.result === "VALID") {
    if (!value.schedulable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedulable"],
        message: "VALID validation must be schedulable",
      });
    }
    if (hasFail || hasNeedsConfirmation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hardChecks"],
        message: "VALID validation cannot contain failed or unresolved hard checks",
      });
    }
  }

  if (value.result === "INVALID") {
    if (value.schedulable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedulable"],
        message: "INVALID validation cannot be schedulable",
      });
    }
    if (!hasFail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hardChecks"],
        message: "INVALID validation requires at least one failed hard check",
      });
    }
  }

  if (value.result === "NEEDS_CONFIRMATION") {
    if (hasFail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hardChecks"],
        message: "A known hard failure must use INVALID rather than NEEDS_CONFIRMATION",
      });
    }
    if (!hasNeedsConfirmation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hardChecks"],
        message: "NEEDS_CONFIRMATION requires at least one unresolved hard check",
      });
    }
    if (
      value.schedulable &&
      unresolvedChecks.some(check => !NON_BLOCKING_CONFIRMATION_CHECKS.has(
        check.check as "ACTIVITY_BUDGET" | "PRICE",
      ))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedulable"],
        message: "Scheduling-critical uncertainty cannot remain schedulable",
      });
    }
  }
});

export type ValidationHardCheck = z.infer<typeof validationHardCheckSchema>;
export type ValidationSnapshotDocument = z.infer<typeof validationSnapshotDocumentSchema>;
