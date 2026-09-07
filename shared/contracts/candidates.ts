import { z } from "zod";
import {
  DURATION_SOURCES,
  PREFERRED_PERIODS,
  SUBMISSION_PREFERENCES,
} from "../enums";
import {
  candidateIdSchema,
  expectedPlanningCycleSchema,
  tripIdSchema,
  warningCodesSchema,
} from "./common";

export const submitCandidateInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,

  placeId: z.string().min(1),

  preference: z.enum(SUBMISSION_PREFERENCES),
  preferredPeriod: z.enum(PREFERRED_PERIODS),

  estimatedDurationMinutes: z.number().int().positive(),
  durationSource: z.enum(DURATION_SOURCES),

  notes: z.string().max(1000).optional(),
});

export const submitCandidateResultSchema = z.object({
  candidateId: candidateIdSchema,
  submissionId: z.string().min(1),
  deduplicated: z.boolean(),
  warningCodes: warningCodesSchema,
});

export const updateSubmissionInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  candidateId: candidateIdSchema,
  patch: z.object({
    preference: z.enum(SUBMISSION_PREFERENCES).optional(),
    preferredPeriod: z.enum(PREFERRED_PERIODS).optional(),
    estimatedDurationMinutes: z.number().int().positive().optional(),
    durationSource: z.enum(DURATION_SOURCES).optional(),
    notes: z.string().max(1000).optional(),
  }).strict().refine(v => Object.keys(v).length > 0, "Patch cannot be empty"),
});

export const updateSubmissionResultSchema = z.object({
  submissionId: z.string().min(1),
  updated: z.literal(true),
});

export const removeSubmissionInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  candidateId: candidateIdSchema,
});

export const removeSubmissionResultSchema = z.object({
  removed: z.literal(true),
  candidateDeactivated: z.boolean(),
});

export type SubmitCandidateInput = z.infer<typeof submitCandidateInputSchema>;
export type SubmitCandidateResult = z.infer<typeof submitCandidateResultSchema>;
export type UpdateSubmissionInput = z.infer<typeof updateSubmissionInputSchema>;
export type UpdateSubmissionResult = z.infer<typeof updateSubmissionResultSchema>;
export type RemoveSubmissionInput = z.infer<typeof removeSubmissionInputSchema>;
export type RemoveSubmissionResult = z.infer<typeof removeSubmissionResultSchema>;
