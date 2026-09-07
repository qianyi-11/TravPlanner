import { z } from "zod";
import {
  expectedPlanningCycleSchema,
  reasonCodesSchema,
  tripIdSchema,
} from "./common";

export const generatePlanningCycleInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
});

export const generatePlanningCycleResultSchema = z.object({
  planningCycle: z.number().int().positive(),
  optionIds: z.array(z.string().min(1)).max(3),
  conflictReasonCodes: reasonCodesSchema,
  reusedExistingOptions: z.boolean(),
});

export type GeneratePlanningCycleInput =
  z.infer<typeof generatePlanningCycleInputSchema>;
export type GeneratePlanningCycleResult =
  z.infer<typeof generatePlanningCycleResultSchema>;
