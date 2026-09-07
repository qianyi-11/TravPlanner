import { setActivityBudgetInputSchema, setActivityBudgetResultSchema, type SetActivityBudgetInput, type SetActivityBudgetResult } from "@travel-planner/shared";
import { callBackend } from "./callable";
export const setActivityBudget = (input: SetActivityBudgetInput): Promise<SetActivityBudgetResult> => callBackend("setActivityBudget", input, setActivityBudgetInputSchema, setActivityBudgetResultSchema);
