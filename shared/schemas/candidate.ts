import { z } from "zod";
import {
  DURATION_SOURCES,
  ENVIRONMENT_TYPES,
  PREFERRED_PERIODS,
  SHORTLIST_STATUSES,
  SUBMISSION_PREFERENCES,
} from "../enums";
import { positiveMinutesSchema } from "./common";

const requiredTimestampSchema = z.custom<unknown>(
  value => value !== undefined && value !== null,
  { message: "Timestamp is required" },
);

const candidateLocationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

export const candidateProviderFactsSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  formattedAddress: z.string().min(1).optional(),
  location: candidateLocationSchema,
  placeTypes: z.array(z.string().min(1)),
}).strict();

export const candidateDocumentSchema = candidateProviderFactsSchema.extend({
  environment: z.enum(ENVIRONMENT_TYPES),
  environmentSource: z.enum(["PROVIDER", "USER_OVERRIDE"]).optional(),
  active: z.boolean(),
  activationVersion: z.number().int().positive().default(1),
  shortlistStatus: z.enum(SHORTLIST_STATUSES),
  firstSubmittedBy: z.string().min(1),
  firstSubmittedAt: requiredTimestampSchema,
  createdAt: requiredTimestampSchema,
  updatedAt: requiredTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.environment === "UNKNOWN" && value.environmentSource !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["environmentSource"], message: "UNKNOWN candidates have no environment source" });
  }
  if (value.environment !== "UNKNOWN" && value.environmentSource === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["environmentSource"], message: "Classified candidates require an environment source" });
  }
});

export const submissionDocumentSchema = z.object({
  candidateId: z.string().min(1),
  memberId: z.string().min(1),
  preference: z.enum(SUBMISSION_PREFERENCES),
  preferredPeriod: z.enum(PREFERRED_PERIODS),
  estimatedDurationMinutes: positiveMinutesSchema,
  durationSource: z.enum(DURATION_SOURCES),
  notes: z.string().max(1000).optional(),
  createdAt: requiredTimestampSchema,
  updatedAt: requiredTimestampSchema,
}).strict();

export type CandidateDocument = z.infer<typeof candidateDocumentSchema>;
export type SubmissionDocument = z.infer<typeof submissionDocumentSchema>;
