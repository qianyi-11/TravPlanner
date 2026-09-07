import { z } from "zod";
import { changeRequestChangeSchema } from "../schemas/changeRequest";
import {
  changeRequestIdSchema,
  tripIdSchema,
  versionIdSchema,
} from "./common";

export { changeRequestChangeSchema };

export const createChangeRequestInputSchema = z.object({
  tripId: tripIdSchema,
  expectedItineraryVersionId: versionIdSchema,
  change: changeRequestChangeSchema,
}).strict();

export const createChangeRequestResultSchema = z.object({
  changeRequestId: changeRequestIdSchema,
  classification: z.enum(["MINOR", "STRUCTURAL"]),
  status: z.literal("PENDING"),
  approvalId: z.string().min(1).optional(),
}).strict();

export const reviewChangeRequestInputSchema = z.object({
  tripId: tripIdSchema,
  expectedItineraryVersionId: versionIdSchema,
  changeRequestId: changeRequestIdSchema,
  decision: z.enum(["REJECT", "PROCEED"]),
}).strict();

export const reviewChangeRequestResultSchema = z.object({
  status: z.enum([
    "PENDING",
    "APPROVED",
    "REJECTED",
    "NEEDS_REVALIDATION",
  ]),
  validationSnapshotId: z.string().min(1).optional(),
}).strict();

export const applyChangeRequestInputSchema = z.object({
  tripId: tripIdSchema,
  expectedItineraryVersionId: versionIdSchema,
  changeRequestId: changeRequestIdSchema,
}).strict();

export const applyChangeRequestResultSchema = z.object({
  changeRequestId: changeRequestIdSchema,
  resultingVersionId: versionIdSchema,
  versionNumber: z.number().int().positive(),
  status: z.literal("APPLIED"),
}).strict();

export type ChangeRequestChange = z.infer<typeof changeRequestChangeSchema>;
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestInputSchema>;
export type CreateChangeRequestResult = z.infer<typeof createChangeRequestResultSchema>;
export type ReviewChangeRequestInput = z.infer<typeof reviewChangeRequestInputSchema>;
export type ReviewChangeRequestResult = z.infer<typeof reviewChangeRequestResultSchema>;
export type ApplyChangeRequestInput = z.infer<typeof applyChangeRequestInputSchema>;
export type ApplyChangeRequestResult = z.infer<typeof applyChangeRequestResultSchema>;
