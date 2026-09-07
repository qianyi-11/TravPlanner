import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  castOptionVoteInputSchema,
  castOptionVoteResultSchema,
  optionVoteDocumentSchema,
  type OptionVoteDocument,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requirePhase,
  requirePlanningCycle,
} from "../auth";

export async function castOptionVoteHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = castOptionVoteInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Option-vote input is invalid.");
  const input = parsed.data;

  return getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["PLANNING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    const state = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (state.activeOwnerId !== context.trip.ownerId) throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
    if (state.activeMemberCount <= 1) throw authError("NOT_APPLICABLE_FOR_SOLO", "Option voting is not applicable to a solo trip.", { tripId: input.tripId });

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const optionRef = tripRef.collection("itineraryOptions").doc(input.optionId);
    const voteRef = tripRef.collection("optionVotes").doc(uid);
    const [optionSnapshot, voteSnapshot] = await Promise.all([
      transaction.get(optionRef),
      transaction.get(voteRef),
    ]);
    if (!optionSnapshot.exists) throw authError("NOT_FOUND", "Itinerary option was not found.", { tripId: input.tripId, targetId: input.optionId });
    if (optionSnapshot.data()?.planningCycle !== context.trip.planningCycle) throw authError("STALE_PLANNING_CYCLE", "The itinerary option is stale.", { tripId: input.tripId, targetId: input.optionId });

    const existing = voteSnapshot.exists ? parseVote(voteSnapshot.data(), input.tripId, uid) : undefined;
    if (existing && existing.memberId === uid && existing.planningCycle === context.trip.planningCycle && existing.optionId === input.optionId) {
      return castOptionVoteResultSchema.parse({ optionId: input.optionId });
    }

    const updatedAt = FieldValue.serverTimestamp();
    const record: OptionVoteDocument = {
      memberId: uid,
      planningCycle: context.trip.planningCycle,
      optionId: input.optionId,
      updatedAt,
    };
    optionVoteDocumentSchema.parse(record);
    if (voteSnapshot.exists) transaction.update(voteRef, record);
    else transaction.create(voteRef, record);
    return castOptionVoteResultSchema.parse({ optionId: input.optionId });
  });
}

export const castOptionVote = onCall({ enforceAppCheck: true }, castOptionVoteHandler);

function parseVote(data: unknown, tripId: string, uid: string): OptionVoteDocument {
  const parsed = optionVoteDocumentSchema.safeParse(data);
  if (!parsed.success || parsed.data.memberId !== uid) throw authError("CONFLICT", "Option vote state is invalid.", { tripId, targetId: uid });
  return parsed.data;
}
