import { generatePlanningCycleInputSchema, generatePlanningCycleResultSchema, type GeneratePlanningCycleInput, type GeneratePlanningCycleResult } from "@travel-planner/shared";
import { callBackend } from "./callable";
export const generatePlanningCycle = (input: GeneratePlanningCycleInput): Promise<GeneratePlanningCycleResult> => callBackend("generatePlanningCycle", input, generatePlanningCycleInputSchema, generatePlanningCycleResultSchema);
