import { z } from "zod";
import { CANDIDATE_VOTE_VALUES } from "../enums";

const requiredTimestampSchema = z.custom<unknown>(
  value => value !== undefined && value !== null,
  { message: "Timestamp is required" },
);
const positiveIntegerSchema = z.number().int().positive();
const scoreSchema = z.union([z.literal(1), z.literal(0), z.literal(-1)]);

const candidateVoteFields = z.object({
  candidateId: z.string().min(1),
  memberId: z.string().min(1),
  value: z.enum(CANDIDATE_VOTE_VALUES),
  score: scoreSchema,
  planningCycle: positiveIntegerSchema,
  createdAt: requiredTimestampSchema,
  updatedAt: requiredTimestampSchema,
});

function enforceCandidateVoteScore(value: { value: "WANT" | "NEUTRAL" | "AVOID"; score: number }, ctx: z.RefinementCtx) {
  const expected = value.value === "WANT" ? 1 : value.value === "AVOID" ? -1 : 0;
  if (value.score !== expected) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["score"], message: "Score does not match value" });
}

export const candidateVoteDocumentSchema = candidateVoteFields.extend({
  candidateActivationVersion: positiveIntegerSchema,
}).strict().superRefine(enforceCandidateVoteScore);

/** Read-only compatibility for MVP/dev vote records that predate activation epochs. */
export const legacyCandidateVoteReadSchema = candidateVoteFields.extend({
  candidateActivationVersion: positiveIntegerSchema.optional(),
}).strict().superRefine(enforceCandidateVoteScore);

export const optionVoteDocumentSchema = z.object({
  memberId: z.string().min(1),
  planningCycle: positiveIntegerSchema,
  optionId: z.string().min(1),
  updatedAt: requiredTimestampSchema,
}).strict();

export type CandidateVoteDocument = z.infer<typeof candidateVoteDocumentSchema>;
export type LegacyCandidateVoteDocument = z.infer<typeof legacyCandidateVoteReadSchema>;
export type OptionVoteDocument = z.infer<typeof optionVoteDocumentSchema>;

export function effectiveCandidateActivationVersion(candidate: { activationVersion?: number }): number {
  return candidate.activationVersion ?? 1;
}

export function effectiveVoteCandidateActivationVersion(vote: { candidateActivationVersion?: number }): number {
  return vote.candidateActivationVersion ?? 1;
}

export function parseLegacyCandidateVote(data: unknown): LegacyCandidateVoteDocument {
  return legacyCandidateVoteReadSchema.parse(data);
}
