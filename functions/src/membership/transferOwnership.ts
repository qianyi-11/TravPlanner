import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { transferOwnershipInputSchema, transferOwnershipResultSchema, tripMemberDocumentSchema } from "@travel-planner/shared";
import { authError, loadAuthoritativeMembershipState, loadTripAuthContextInTransaction, requireActiveMember, requireOwner, requireAuth } from "../auth";

export async function transferOwnershipHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = transferOwnershipInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Ownership-transfer input is invalid.");

  const result = await getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, parsed.data.tripId, uid);
    const tripRef = getFirestore().collection("trips").doc(parsed.data.tripId);
    const targetRef = tripRef.collection("members").doc(parsed.data.newOwnerId);
    const targetSnapshot = await transaction.get(targetRef);
    if (!targetSnapshot.exists) throw authError("NOT_FOUND", "Target membership was not found.", { tripId: parsed.data.tripId, targetId: parsed.data.newOwnerId });
    const target = tripMemberDocumentSchema.parse(targetSnapshot.data());
    const state = await loadAuthoritativeMembershipState(transaction, parsed.data.tripId);
    if (!state.activeOwnerId || state.activeOwnerId !== context.trip.ownerId || state.activeMemberCount < 1) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: parsed.data.tripId });
    }

    requireActiveMember(context);
    if (target.status === "ACTIVE" && target.role === "OWNER" && state.activeOwnerId === parsed.data.newOwnerId) {
      return transferOwnershipResultSchema.parse({
        previousOwnerId: parsed.data.newOwnerId,
        ownerId: parsed.data.newOwnerId,
        changed: false,
        membershipVersion: context.trip.membershipVersion,
      });
    }

    requireOwner(context);
    if (target.status !== "ACTIVE" || target.role !== "MEMBER") {
      throw authError("CONFLICT", "The target must be an ACTIVE MEMBER.", { tripId: parsed.data.tripId, targetId: parsed.data.newOwnerId });
    }

    const previousOwnerId = state.activeOwnerId;
    const timestamp = FieldValue.serverTimestamp();
    const oldOwnerRef = tripRef.collection("members").doc(previousOwnerId);
    const oldProjectionRef = getFirestore().collection("users").doc(previousOwnerId).collection("tripMemberships").doc(parsed.data.tripId);
    const newProjectionRef = getFirestore().collection("users").doc(parsed.data.newOwnerId).collection("tripMemberships").doc(parsed.data.tripId);
    transaction.update(oldOwnerRef, { role: "MEMBER", updatedAt: timestamp });
    transaction.update(targetRef, { role: "OWNER", updatedAt: timestamp });
    transaction.update(tripRef, { ownerId: parsed.data.newOwnerId, updatedAt: timestamp });
    transaction.set(oldProjectionRef, { role: "MEMBER", updatedAt: timestamp }, { merge: true });
    transaction.set(newProjectionRef, { role: "OWNER", updatedAt: timestamp }, { merge: true });

    return transferOwnershipResultSchema.parse({
      previousOwnerId,
      ownerId: parsed.data.newOwnerId,
      changed: true,
      membershipVersion: context.trip.membershipVersion,
    });
  });

  return transferOwnershipResultSchema.parse(result);
}

export const transferOwnership = onCall({ enforceAppCheck: true }, transferOwnershipHandler);
