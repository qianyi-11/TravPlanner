import { z } from "zod";
import { criticalFactSchema } from "../schemas/criticalFactProposal";
import {
  candidateIdSchema,
  criticalFactProposalIdSchema,
  expectedItineraryVersionIdSchema,
  expectedPlanningCycleSchema,
  tripIdSchema,
  validationSnapshotIdSchema,
} from "./common";

const proposeCriticalFactBaseShape = {
  tripId: tripIdSchema,
  candidateId: candidateIdSchema,
  fact: criticalFactSchema,
  note: z.string().max(1000).optional(),
};

export const proposeCriticalFactInputSchema = z.union([
  z.object({
    ...proposeCriticalFactBaseShape,
    expectedPlanningCycle: expectedPlanningCycleSchema,
  }).strict(),
  z.object({
    ...proposeCriticalFactBaseShape,
    expectedItineraryVersionId: expectedItineraryVersionIdSchema,
  }).strict(),
]);

export const proposeCriticalFactResultSchema = z.object({
  proposalId: criticalFactProposalIdSchema,
  status: z.literal("PENDING"),
}).strict();

const confirmCriticalFactBaseShape = {
  tripId: tripIdSchema,
  proposalId: criticalFactProposalIdSchema,
  decision: z.enum(["CONFIRM", "REJECT"]),
};

export const confirmCriticalFactInputSchema = z.union([
  z.object({
    ...confirmCriticalFactBaseShape,
    expectedPlanningCycle: expectedPlanningCycleSchema,
  }).strict(),
  z.object({
    ...confirmCriticalFactBaseShape,
    expectedItineraryVersionId: expectedItineraryVersionIdSchema,
  }).strict(),
]);

export const confirmCriticalFactResultSchema = z.object({
  proposalId: criticalFactProposalIdSchema,
  status: z.enum(["CONFIRMED", "REJECTED"]),
  changed: z.boolean(),
  validationSnapshotId: validationSnapshotIdSchema.optional(),
}).strict();

export type ProposeCriticalFactInput = z.infer<typeof proposeCriticalFactInputSchema>;
export type ProposeCriticalFactResult = z.infer<typeof proposeCriticalFactResultSchema>;
export type ConfirmCriticalFactInput = z.infer<typeof confirmCriticalFactInputSchema>;
export type ConfirmCriticalFactResult = z.infer<typeof confirmCriticalFactResultSchema>;
