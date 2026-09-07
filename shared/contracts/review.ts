import { z } from "zod";
import {
  dateStringSchema,
  positiveMinutesSchema,
  timeStringSchema,
} from "../schemas";
import {
  approvalIdSchema,
  expectedPlanningCycleSchema,
  expectedReviewDraftRevisionSchema,
  tripIdSchema,
} from "./common";

export const minorEditSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MOVE_ITEM"),
    itemId: z.string().min(1),
    targetDate: dateStringSchema,
    targetStartTime: timeStringSchema,
  }).strict(),
  z.object({
    type: z.literal("CHANGE_DURATION"),
    itemId: z.string().min(1),
    durationMinutes: positiveMinutesSchema,
  }).strict(),
]);

export const applyMinorEditInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  expectedReviewDraftRevision: expectedReviewDraftRevisionSchema,
  edit: minorEditSchema,
}).strict();

export const applyMinorEditResultSchema = z.object({
  reviewDraftRevision: z.number().int().positive(),
  validationSnapshotId: z.string().min(1),
  approvalId: approvalIdSchema.optional(),
}).strict();

export const submitApprovalInputSchema = z.object({
  tripId: tripIdSchema,
  approvalId: approvalIdSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

export const submitApprovalResultSchema = z.object({
  approvalId: approvalIdSchema,
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  yesCount: z.number().int().nonnegative(),
  noCount: z.number().int().nonnegative(),
  requiredApprovalCount: z.number().int().positive(),
}).strict();

export const finalizeTripInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  expectedReviewDraftRevision: expectedReviewDraftRevisionSchema,
}).strict();

export const finalizeTripResultSchema = z.object({
  versionId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  phase: z.literal("FINALIZED"),
}).strict();

export type MinorEdit = z.infer<typeof minorEditSchema>;
export type ApplyMinorEditInput = z.infer<typeof applyMinorEditInputSchema>;
export type ApplyMinorEditResult = z.infer<typeof applyMinorEditResultSchema>;
export type SubmitApprovalInput = z.infer<typeof submitApprovalInputSchema>;
export type SubmitApprovalResult = z.infer<typeof submitApprovalResultSchema>;
export type FinalizeTripInput = z.infer<typeof finalizeTripInputSchema>;
export type FinalizeTripResult = z.infer<typeof finalizeTripResultSchema>;
