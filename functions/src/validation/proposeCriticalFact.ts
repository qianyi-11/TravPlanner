import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  criticalFactProposalDocumentSchema,
  persistedCriticalFactSchema,
  proposeCriticalFactInputSchema,
  proposeCriticalFactResultSchema,
  type PersistedCriticalFact,
} from "@travel-planner/shared";
import {
  authError,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requirePhase,
} from "../auth";
import { toExactMinorUnits } from "./money";
import { requireCriticalFactExpectedAuthority } from "./criticalFactAuthority";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";

function bindPersistedFact(
  fact: ReturnType<typeof proposeCriticalFactInputSchema.parse>["fact"],
  activityBudgetCurrency: string,
): PersistedCriticalFact {
  if (fact.type !== "PRICE") return persistedCriticalFactSchema.parse(fact);
  if (toExactMinorUnits(fact.amount, activityBudgetCurrency) === null) {
    throw authError(
      "INVALID_INPUT",
      "PRICE must use the current supported trip currency and valid minor-unit precision.",
    );
  }
  return persistedCriticalFactSchema.parse({
    ...fact,
    currency: activityBudgetCurrency,
  });
}

export async function proposeCriticalFactHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = proposeCriticalFactInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw authError("INVALID_INPUT", "Invalid Critical Fact proposal input.", {
      issues: parsed.error.issues,
    });
  }
  const input = parsed.data;

  return getFirestore().runTransaction(async (transaction: import("firebase-admin/firestore").Transaction) => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["PLANNING", "REVIEW", "FINALIZED"]);
    requireCriticalFactExpectedAuthority(context, input);

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const candidateRef = tripRef.collection("candidates").doc(input.candidateId);
    const candidateSnapshot = await transaction.get(candidateRef);
    if (!candidateSnapshot.exists) {
      throw authError("NOT_FOUND", "Candidate was not found.", {
        tripId: input.tripId,
        targetId: input.candidateId,
      });
    }
    const candidate = candidateDocumentSchema.safeParse(candidateSnapshot.data());
    if (
      !candidate.success ||
      candidateIdFromPlaceId(candidate.success ? candidate.data.placeId : "") !== input.candidateId
    ) {
      throw authError("CONFLICT", "Candidate state is malformed or identity is inconsistent.", {
        tripId: input.tripId,
        targetId: input.candidateId,
      });
    }

    const fact = bindPersistedFact(input.fact, context.trip.activityBudgetCurrency);
    const now = Timestamp.now();
    const proposal = criticalFactProposalDocumentSchema.parse({
      candidateId: input.candidateId,
      fact,
      proposedBy: uid,
      ...(input.note === undefined ? {} : { note: input.note }),
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    });
    const proposalRef = tripRef.collection("criticalFactProposals").doc();
    transaction.create(proposalRef, proposal);

    return proposeCriticalFactResultSchema.parse({
      proposalId: proposalRef.id,
      status: "PENDING",
    });
  });
}

export const proposeCriticalFact = onCall(
  { enforceAppCheck: true },
  proposeCriticalFactHandler,
);
