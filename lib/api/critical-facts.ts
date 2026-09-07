import { proposeCriticalFactInputSchema, proposeCriticalFactResultSchema, confirmCriticalFactInputSchema, confirmCriticalFactResultSchema, type ProposeCriticalFactInput, type ProposeCriticalFactResult, type ConfirmCriticalFactInput, type ConfirmCriticalFactResult } from "@travel-planner/shared";
import { callBackend } from "./callable";
export const proposeCriticalFact = (input: ProposeCriticalFactInput): Promise<ProposeCriticalFactResult> => callBackend("proposeCriticalFact", input, proposeCriticalFactInputSchema, proposeCriticalFactResultSchema);
export const confirmCriticalFact = (input: ConfirmCriticalFactInput): Promise<ConfirmCriticalFactResult> => callBackend("confirmCriticalFact", input, confirmCriticalFactInputSchema, confirmCriticalFactResultSchema);
