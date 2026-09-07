import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  confirmCriticalFactInputSchema,
  confirmCriticalFactResultSchema,
  criticalFactProposalDocumentSchema,
  type CriticalFactProposalDocument,
} from "@travel-planner/shared";
import {
  authError,
  loadTripAuthContext,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requireMembershipVersion,
  requireOwner,
  requirePhase,
} from "../auth";
import {
  ExternalSnapshotStateError,
  prepareUserConfirmedExternalSnapshot,
  type StoredExternalSnapshot,
} from "../integrations/externalSnapshots";
import {
  getGooglePlaceDetailsSnapshot,
} from "../integrations/google/placeDetails";
import { GOOGLE_MAPS_API_KEY } from "../integrations/google/places";
import {
  buildCriticalFactScopeKey,
  buildPlaceDetailsCacheKey,
  compareProposalRecency,
} from "./criticalFactScope";
import { requireCriticalFactExpectedAuthority } from "./criticalFactAuthority";
import { loadAndEvaluateCandidateValidationInTransaction } from "./candidateValidationLoader";
import { createValidationSnapshotInTransaction } from "./validationSnapshotStore";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";

function parseProposal(
  data: unknown,
  proposalId: string,
  tripId: string,
): CriticalFactProposalDocument {
  const parsed = criticalFactProposalDocumentSchema.safeParse(data);
  if (!parsed.success) {
    throw authError("CONFLICT", "Critical Fact proposal state is malformed.", {
      tripId,
      targetId: proposalId,
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

function resolvedDecision(proposal: CriticalFactProposalDocument): "CONFIRM" | "REJECT" | null {
  if (proposal.status === "CONFIRMED") return "CONFIRM";
  if (proposal.status === "REJECTED") return "REJECT";
  return null;
}

export type PlaceDetailsSnapshotResolver = typeof getGooglePlaceDetailsSnapshot;

async function preflightPlaceDetails(input: {
  tripId: string;
  uid: string;
  requestInput: ReturnType<typeof confirmCriticalFactInputSchema.parse>;
  placeDetailsResolver: PlaceDetailsSnapshotResolver;
}): Promise<{
  membershipVersion: number;
  snapshot?: StoredExternalSnapshot;
}> {
  const context = await loadTripAuthContext(input.tripId, input.uid);
  requireActiveMember(context);
  requireOwner(context);
  requirePhase(context, ["PLANNING", "REVIEW", "FINALIZED"]);
  requireCriticalFactExpectedAuthority(context, input.requestInput);

  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const proposalSnapshot = await tripRef
    .collection("criticalFactProposals")
    .doc(input.requestInput.proposalId)
    .get();
  if (!proposalSnapshot.exists) {
    throw authError("NOT_FOUND", "Critical Fact proposal was not found.", {
      tripId: input.tripId,
      targetId: input.requestInput.proposalId,
    });
  }
  const proposal = parseProposal(proposalSnapshot.data(), proposalSnapshot.id, input.tripId);
  if (
    input.requestInput.decision !== "CONFIRM" ||
    proposal.status !== "PENDING"
  ) {
    return { membershipVersion: context.trip.membershipVersion };
  }

  const candidateSnapshot = await tripRef.collection("candidates").doc(proposal.candidateId).get();
  if (!candidateSnapshot.exists) {
    throw authError("NOT_FOUND", "Candidate was not found.", {
      tripId: input.tripId,
      targetId: proposal.candidateId,
    });
  }
  const candidate = candidateDocumentSchema.safeParse(candidateSnapshot.data());
  if (
    !candidate.success ||
    candidateIdFromPlaceId(candidate.success ? candidate.data.placeId : "") !== proposal.candidateId
  ) {
    throw authError("CONFLICT", "Candidate state is malformed or identity is inconsistent.", {
      tripId: input.tripId,
      targetId: proposal.candidateId,
    });
  }

  let snapshot: StoredExternalSnapshot;
  try {
    snapshot = await input.placeDetailsResolver({
      tripId: input.tripId,
      placeId: candidate.data.placeId,
      tripTimezone: context.trip.timezone,
      tripStartDate: context.trip.startDate,
      tripEndDate: context.trip.endDate,
    });
  } catch (error) {
    if (error instanceof ExternalSnapshotStateError) {
      throw authError("CONFLICT", "External snapshot cache state is malformed.", {
        tripId: input.tripId,
        targetId: proposal.candidateId,
      });
    }
    throw error;
  }
  return {
    membershipVersion: context.trip.membershipVersion,
    snapshot,
  };
}

export function confirmCriticalFactHandler(request: CallableRequest<unknown>) {
  return confirmCriticalFactHandlerWithPlaceDetails(request, getGooglePlaceDetailsSnapshot);
}

export async function confirmCriticalFactHandlerWithPlaceDetails(
  request: CallableRequest<unknown>,
  placeDetailsResolver: PlaceDetailsSnapshotResolver,
) {
  const uid = requireAuth(request);
  const parsed = confirmCriticalFactInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw authError("INVALID_INPUT", "Invalid Critical Fact confirmation input.", {
      issues: parsed.error.issues,
    });
  }
  const input = parsed.data;

  const preflight = await preflightPlaceDetails({
    tripId: input.tripId,
    uid,
    requestInput: input,
    placeDetailsResolver,
  });

  return getFirestore().runTransaction(async (transaction: import("firebase-admin/firestore").Transaction) => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requireOwner(context);
    requirePhase(context, ["PLANNING", "REVIEW", "FINALIZED"]);
    requireCriticalFactExpectedAuthority(context, input);
    requireMembershipVersion(context, preflight.membershipVersion);

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const currentProposalRef = tripRef.collection("criticalFactProposals").doc(input.proposalId);
    const currentProposalSnapshot = await transaction.get(currentProposalRef);
    if (!currentProposalSnapshot.exists) {
      throw authError("NOT_FOUND", "Critical Fact proposal was not found.", {
        tripId: input.tripId,
        targetId: input.proposalId,
      });
    }
    const proposal = parseProposal(currentProposalSnapshot.data(), input.proposalId, input.tripId);
    const existingDecision = resolvedDecision(proposal);
    if (existingDecision !== null) {
      if (existingDecision !== input.decision) {
        throw authError("CONFLICT", "Critical Fact proposal is already resolved with the opposite decision.", {
          tripId: input.tripId,
          targetId: input.proposalId,
        });
      }
      return confirmCriticalFactResultSchema.parse({
        proposalId: input.proposalId,
        status: proposal.status,
        changed: false,
      });
    }

    if (input.decision === "REJECT") {
      const rejectedAt = Timestamp.now();
      const rejected = criticalFactProposalDocumentSchema.parse({
        candidateId: proposal.candidateId,
        fact: proposal.fact,
        proposedBy: proposal.proposedBy,
        ...(proposal.note === undefined ? {} : { note: proposal.note }),
        status: "REJECTED",
        createdAt: proposal.createdAt,
        updatedAt: rejectedAt,
        rejectedBy: uid,
        rejectedAt,
      });
      transaction.set(currentProposalRef, rejected);
      return confirmCriticalFactResultSchema.parse({
        proposalId: input.proposalId,
        status: "REJECTED",
        changed: true,
      });
    }

    if (
      proposal.fact.type === "PRICE" &&
      proposal.fact.currency !== context.trip.activityBudgetCurrency
    ) {
      throw authError("CONFLICT", "Trip currency changed; PRICE must be re-proposed.", {
        tripId: input.tripId,
        targetId: input.proposalId,
      });
    }

    const proposalsSnapshot = await transaction.get(
      tripRef.collection("criticalFactProposals").where("candidateId", "==", proposal.candidateId),
    );
    const currentScope = buildCriticalFactScopeKey({
      candidateId: proposal.candidateId,
      fact: proposal.fact,
      timezone: context.trip.timezone,
    });
    for (const document of proposalsSnapshot.docs) {
      if (document.id === input.proposalId) continue;
      const other = parseProposal(document.data(), document.id, input.tripId);
      if (other.status === "REJECTED") continue;
      const otherScope = buildCriticalFactScopeKey({
        candidateId: other.candidateId,
        fact: other.fact,
        timezone: context.trip.timezone,
      });
      if (
        otherScope === currentScope &&
        compareProposalRecency(
          { proposalId: document.id, createdAt: other.createdAt },
          { proposalId: input.proposalId, createdAt: proposal.createdAt },
        ) > 0
      ) {
        throw authError("CONFLICT", "A newer proposal exists for the same Critical Fact scope.", {
          tripId: input.tripId,
          targetId: input.proposalId,
          newerProposalId: document.id,
        });
      }
    }

    if (!preflight.snapshot || preflight.snapshot.snapshot.kind !== "PLACE_DETAILS") {
      throw authError("CONFLICT", "Candidate provider snapshot was not prepared for confirmation.", {
        tripId: input.tripId,
        targetId: proposal.candidateId,
      });
    }
    const finalCandidateSnapshot = await transaction.get(
      tripRef.collection("candidates").doc(proposal.candidateId),
    );
    if (!finalCandidateSnapshot.exists) {
      throw authError("NOT_FOUND", "Candidate was not found.", {
        tripId: input.tripId,
        targetId: proposal.candidateId,
      });
    }
    const finalCandidate = candidateDocumentSchema.safeParse(finalCandidateSnapshot.data());
    if (
      !finalCandidate.success ||
      candidateIdFromPlaceId(finalCandidate.success ? finalCandidate.data.placeId : "") !== proposal.candidateId
    ) {
      throw authError("CONFLICT", "Candidate state is malformed or identity is inconsistent.", {
        tripId: input.tripId,
        targetId: proposal.candidateId,
      });
    }
    const expectedPlaceCacheKey = buildPlaceDetailsCacheKey({
      placeId: finalCandidate.data.placeId,
      timezone: context.trip.timezone,
      startDate: context.trip.startDate,
      endDate: context.trip.endDate,
    });
    if (preflight.snapshot.snapshot.cacheKey !== expectedPlaceCacheKey) {
      throw authError("CONFLICT", "Prepared provider snapshot no longer matches trip/candidate authority.", {
        tripId: input.tripId,
        targetId: proposal.candidateId,
      });
    }
    if (
      preflight.snapshot.snapshot.data !== undefined &&
      preflight.snapshot.snapshot.data.placeId !== finalCandidate.data.placeId
    ) {
      throw authError("CONFLICT", "Prepared provider snapshot identity no longer matches the candidate.", {
        tripId: input.tripId,
        targetId: proposal.candidateId,
      });
    }

    const confirmedAt = Timestamp.now();
    const preparedFact = prepareUserConfirmedExternalSnapshot({
      tripId: input.tripId,
      cacheKey: currentScope,
      fact: proposal.fact,
      submittedBy: proposal.proposedBy,
      confirmedBy: uid,
      confirmedAt,
    });

    const candidateValidation = await loadAndEvaluateCandidateValidationInTransaction({
      transaction,
      tripId: input.tripId,
      trip: context.trip,
      candidateId: proposal.candidateId,
      placeDetailsSnapshot: preflight.snapshot,
      additionalCriticalFactSnapshots: [preparedFact.stored],
    });

    const validationSnapshotId = createValidationSnapshotInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
      scope: "CANDIDATE",
      targetId: proposal.candidateId,
      evaluation: candidateValidation.evaluation,
      externalSnapshotIds: candidateValidation.externalSnapshotIds,
      checkedAt: confirmedAt,
    });
    const confirmed = criticalFactProposalDocumentSchema.parse({
      candidateId: proposal.candidateId,
      fact: proposal.fact,
      proposedBy: proposal.proposedBy,
      ...(proposal.note === undefined ? {} : { note: proposal.note }),
      status: "CONFIRMED",
      createdAt: proposal.createdAt,
      updatedAt: confirmedAt,
      confirmedBy: uid,
      confirmedAt,
    });

    transaction.set(currentProposalRef, confirmed);
    preparedFact.write(transaction);

    return confirmCriticalFactResultSchema.parse({
      proposalId: input.proposalId,
      status: "CONFIRMED",
      changed: true,
      validationSnapshotId,
    });
  });
}

export const confirmCriticalFact = onCall(
  { enforceAppCheck: true, secrets: [GOOGLE_MAPS_API_KEY] },
  confirmCriticalFactHandler,
);
