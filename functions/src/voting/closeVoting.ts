import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { closeVotingInputSchema, closeVotingResultSchema } from "@travel-planner/shared";
import { authError, loadTripAuthContextInTransaction, requireAuth, requireOwner, requirePhase, requirePlanningCycle } from "../auth";

export async function closeVotingHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = closeVotingInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Close-voting input is invalid.");
  const input = parsed.data;
  return getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePhase(context, ["VOTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    const updatedAt = FieldValue.serverTimestamp();
    transaction.update(getFirestore().collection("trips").doc(input.tripId), { phase: "PLANNING", updatedAt });
    return closeVotingResultSchema.parse({ phase: "PLANNING", planningCycle: context.trip.planningCycle });
  });
}

export const closeVoting = onCall({ enforceAppCheck: true }, closeVotingHandler);
