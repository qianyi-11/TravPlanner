import { z } from "zod";
import { tripIdSchema, versionIdSchema } from "./common";

export const requestBackupInputSchema = z.object({
  tripId: tripIdSchema,
  expectedItineraryVersionId: versionIdSchema,
  sourceItemId: z.string().min(1),
  reason: z.literal("RAIN_OR_UNSUITABLE_OUTDOOR"),
});

export const requestBackupResultSchema = z.object({
  sourceItemId: z.string().min(1),
  backupCandidateIds: z.array(z.string().min(1)),
});

export const applyBackupInputSchema = z.object({
  tripId: tripIdSchema,
  expectedItineraryVersionId: versionIdSchema,
  sourceItemId: z.string().min(1),
  backupCandidateId: z.string().min(1),
});

export const applyBackupResultSchema = z.object({
  applied: z.boolean(),
  approvalRequired: z.boolean(),
  approvalId: z.string().min(1).optional(),
  versionId: versionIdSchema.optional(),
  versionNumber: z.number().int().positive().optional(),
});

export type RequestBackupInput = z.infer<typeof requestBackupInputSchema>;
export type RequestBackupResult = z.infer<typeof requestBackupResultSchema>;
export type ApplyBackupInput = z.infer<typeof applyBackupInputSchema>;
export type ApplyBackupResult = z.infer<typeof applyBackupResultSchema>;
