import { applyMinorEditInputSchema, applyMinorEditResultSchema, submitApprovalInputSchema, submitApprovalResultSchema, finalizeTripInputSchema, finalizeTripResultSchema, type ApplyMinorEditInput, type ApplyMinorEditResult, type SubmitApprovalInput, type SubmitApprovalResult, type FinalizeTripInput, type FinalizeTripResult } from "@travel-planner/shared";
import { callBackend } from "./callable";
export const applyMinorEdit = (input: ApplyMinorEditInput): Promise<ApplyMinorEditResult> => callBackend("applyMinorEdit", input, applyMinorEditInputSchema, applyMinorEditResultSchema);
export const submitApproval = (input: SubmitApprovalInput): Promise<SubmitApprovalResult> => callBackend("submitApproval", input, submitApprovalInputSchema, submitApprovalResultSchema);
export const finalizeTrip = (input: FinalizeTripInput): Promise<FinalizeTripResult> => callBackend("finalizeTrip", input, finalizeTripInputSchema, finalizeTripResultSchema);
