import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  approvalDocumentSchema,
  changeRequestDocumentSchema,
  createChangeRequestInputSchema,
  createChangeRequestResultSchema,
  splitChangeRequestChange,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requireCurrentVersion,
  requirePhase,
} from "../auth";
import {
  classifyAndValidateChangeRequestInTransaction,
  loadItineraryVersionInTransaction,
} from "./changeRequestDomain";

export async function createChangeRequestHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = createChangeRequestInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw authError("INVALID_INPUT", "Change Request input is invalid.");
  }
  const input = parsed.data;
  const db = getFirestore();

  return db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["FINALIZED"]);
    requireCurrentVersion(context, input.expectedItineraryVersionId);

    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (!membership.activeOwnerId || membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", {
        tripId: input.tripId,
      });
    }

    const version = await loadItineraryVersionInTransaction({
      transaction,
      tripId: input.tripId,
      versionId: input.expectedItineraryVersionId,
    });
    const classification = await classifyAndValidateChangeRequestInTransaction({
      transaction,
      tripId: input.tripId,
      trip: context.trip,
      membership,
      version,
      change: input.change,
    });

    const tripRef = db.collection("trips").doc(input.tripId);
    const changeRequestRef = tripRef.collection("changeRequests").doc();
    const timestamp = FieldValue.serverTimestamp();
    let approvalId: string | undefined;

    if (!membership.isSolo && classification === "STRUCTURAL") {
      const approvalRef = tripRef.collection("approvals").doc();
      approvalId = approvalRef.id;
      const approval = approvalDocumentSchema.parse({
        type: "STRUCTURAL_CHANGE",
        subjectType: "CHANGE_REQUEST",
        subjectId: changeRequestRef.id,
        status: "PENDING",
        yesCount: 0,
        noCount: 0,
        createdBy: uid,
        createdAt: timestamp,
      });
      transaction.create(approvalRef, approval);
    }

    const encoded = splitChangeRequestChange(input.change);
    const document = changeRequestDocumentSchema.parse({
      baseItineraryVersionId: input.expectedItineraryVersionId,
      requestedBy: uid,
      classification,
      operation: encoded.operation,
      payload: encoded.payload,
      status: "PENDING",
      ...(approvalId ? { approvalId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.create(changeRequestRef, document);

    return createChangeRequestResultSchema.parse({
      changeRequestId: changeRequestRef.id,
      classification,
      status: "PENDING",
      ...(approvalId ? { approvalId } : {}),
    });
  });
}

export const createChangeRequest = onCall(
  { enforceAppCheck: true },
  createChangeRequestHandler,
);
