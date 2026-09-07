import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  resetInviteInputSchema,
  resetInviteResultSchema,
} from "@travel-planner/shared";
import {
  authError,
  loadTripAuthContextInTransaction,
  requireAuth,
  requireOwner,
} from "../auth";
import { generateInviteToken, hashInviteToken } from "./inviteToken";
import { z } from "zod";

const inviteDocumentSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  createdAt: z.unknown(),
  resetAt: z.unknown().optional(),
});

export async function resetInviteHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = resetInviteInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Trip ID is invalid.");

  const result = await getFirestore().runTransaction(async (transaction) => {
    const context = await loadTripAuthContextInTransaction(transaction, parsed.data.tripId, uid);
    const inviteRef = getFirestore().collection("trips").doc(parsed.data.tripId).collection("private").doc("invite");
    const inviteSnapshot = await transaction.get(inviteRef);

    requireOwner(context);
    if (!["COLLECTING", "VOTING", "PLANNING", "REVIEW"].includes(context.trip.phase)) {
      throw authError("INVALID_PHASE", "Invite reset is unavailable in this phase.", {
        tripId: parsed.data.tripId,
        phase: context.trip.phase,
      });
    }
    if (!inviteSnapshot.exists) {
      throw authError("NOT_FOUND", "Invite was not found.", { tripId: parsed.data.tripId });
    }

    const inviteResult = inviteDocumentSchema.safeParse(inviteSnapshot.data());
    if (!inviteResult.success) {
      throw authError("CONFLICT", "Invite state is invalid.", { tripId: parsed.data.tripId });
    }

    if (!Number.isSafeInteger(inviteResult.data.version)) {
      throw authError("CONFLICT", "Invite state is invalid.", { tripId: parsed.data.tripId });
    }
    const newVersion = inviteResult.data.version + 1;
    if (!Number.isSafeInteger(newVersion)) {
      throw authError("CONFLICT", "Invite state is invalid.", { tripId: parsed.data.tripId });
    }
    const inviteToken = generateInviteToken(newVersion);
    transaction.update(inviteRef, {
      tokenHash: hashInviteToken(inviteToken),
      version: newVersion,
      resetAt: FieldValue.serverTimestamp(),
    });
    return { inviteToken, inviteVersion: newVersion };
  });

  return resetInviteResultSchema.parse(result);
}

export const resetInvite = onCall({ enforceAppCheck: true }, resetInviteHandler);
