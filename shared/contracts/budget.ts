import { z } from "zod";
import { expectedPlanningCycleSchema, tripIdSchema } from "./common";

export const setActivityBudgetInputSchema = z.union([
  z.object({
    tripId: tripIdSchema,
    expectedPlanningCycle: expectedPlanningCycleSchema,
    amount: z.number().finite().positive(),
  }).strict(),
  z.object({
    tripId: tripIdSchema,
    expectedPlanningCycle: expectedPlanningCycleSchema,
    clear: z.literal(true),
  }).strict(),
]);

export const setActivityBudgetResultSchema = z.object({
  safeActivityBudgetCeiling: z.number().finite().positive().optional(),
  phase: z.enum(["COLLECTING", "VOTING"]),
  planningCycle: z.number().int().positive(),
  cleared: z.boolean(),
}).strict();

export type SetActivityBudgetInput = z.infer<typeof setActivityBudgetInputSchema>;
export type SetActivityBudgetResult = z.infer<typeof setActivityBudgetResultSchema>;
