import { z } from "zod";
import { CANDIDATE_VOTE_VALUES } from "../enums";
import {
  candidateIdSchema,
  expectedPlanningCycleSchema,
  optionIdSchema,
  tripIdSchema,
} from "./common";

export const startVotingInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
});
export const startVotingResultSchema = z.object({
  phase: z.literal("VOTING"),
  planningCycle: z.number().int().positive(),
});

export const castCandidateVoteInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  candidateId: candidateIdSchema,
  value: z.enum(CANDIDATE_VOTE_VALUES),
});
export const castCandidateVoteResultSchema = z.object({
  candidateId: candidateIdSchema,
  value: z.enum(CANDIDATE_VOTE_VALUES),
});

export const closeVotingInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
});
export const closeVotingResultSchema = z.object({
  phase: z.literal("PLANNING"),
  planningCycle: z.number().int().positive(),
});

export const castOptionVoteInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  optionId: optionIdSchema,
});
export const castOptionVoteResultSchema = z.object({
  optionId: optionIdSchema,
});

export const selectWinningOptionInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  selectedOptionId: optionIdSchema.optional(),
  tieBreakOptionId: optionIdSchema.optional(),
}).strict().refine(
  value => !(value.selectedOptionId && value.tieBreakOptionId),
  "selectedOptionId and tieBreakOptionId cannot be used together",
);
export const selectWinningOptionResultSchema = z.object({
  selectedOptionId: optionIdSchema,
  reviewDraftRevision: z.literal(1),
  approvalId: z.string().min(1).optional(),
  phase: z.literal("REVIEW"),
  tieBroken: z.boolean().optional(),
}).strict();

export type StartVotingInput = z.infer<typeof startVotingInputSchema>;
export type StartVotingResult = z.infer<typeof startVotingResultSchema>;
export type CastCandidateVoteInput = z.infer<typeof castCandidateVoteInputSchema>;
export type CastCandidateVoteResult = z.infer<typeof castCandidateVoteResultSchema>;
export type CloseVotingInput = z.infer<typeof closeVotingInputSchema>;
export type CloseVotingResult = z.infer<typeof closeVotingResultSchema>;
export type CastOptionVoteInput = z.infer<typeof castOptionVoteInputSchema>;
export type CastOptionVoteResult = z.infer<typeof castOptionVoteResultSchema>;
export type SelectWinningOptionInput = z.infer<typeof selectWinningOptionInputSchema>;
export type SelectWinningOptionResult = z.infer<typeof selectWinningOptionResultSchema>;
