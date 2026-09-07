import { z } from "zod";
import { firestoreTimestampSchema } from "./common";

export const approvalDocumentSchema = z.object({
  type: z.enum([
    "FINAL_ITINERARY",
    "MUST_DO_CONFLICT",
    "BUDGET_EXCEPTION",
    "STRUCTURAL_CHANGE",
  ]),
  planningCycle: z.number().int().positive().optional(),
  subjectType: z.enum([
    "CANDIDATE",
    "REVIEW_DRAFT",
    "CHANGE_REQUEST",
    "BACKUP",
    "BUDGET_EXCEPTION",
  ]),
  subjectId: z.string().min(1),
  subjectRevision: z.number().int().positive().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "STALE"]),
  yesCount: z.number().int().nonnegative(),
  noCount: z.number().int().nonnegative(),
  createdBy: z.string().min(1),
  createdAt: firestoreTimestampSchema,
  resolvedAt: firestoreTimestampSchema.optional(),
}).strict();

export const approvalResponseDocumentSchema = z.object({
  memberId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  updatedAt: firestoreTimestampSchema,
}).strict();

export type ApprovalDocument = z.infer<typeof approvalDocumentSchema>;
export type ApprovalResponseDocument = z.infer<typeof approvalResponseDocumentSchema>;
