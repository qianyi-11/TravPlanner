import { getFirestore, type Transaction } from "firebase-admin/firestore";
import {
  candidateDocumentSchema,
  submissionDocumentSchema,
  type TripDocument,
} from "@travel-planner/shared";
import {
  ExternalSnapshotStateError,
  loadExternalSnapshotsForCacheKeysInTransaction,
  type StoredExternalSnapshot,
} from "../integrations/externalSnapshots";
import { authError, loadAuthoritativeMembershipState } from "../auth";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";
import { candidateCriticalFactScopeKeys } from "./criticalFactScope";
import { evaluateCandidateValidation, type CandidatePlacementContext } from "./validateCandidate";

export async function loadAndEvaluateCandidateValidationInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  trip: TripDocument;
  candidateId: string;
  placeDetailsSnapshot?: StoredExternalSnapshot;
  additionalCriticalFactSnapshots?: readonly StoredExternalSnapshot[];
  placement?: CandidatePlacementContext;
}) {
  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const candidateRef = tripRef.collection("candidates").doc(input.candidateId);
  const candidateSnapshot = await input.transaction.get(candidateRef);
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
    throw authError("CONFLICT", "Candidate state is malformed or inconsistent.", {
      tripId: input.tripId,
      targetId: input.candidateId,
    });
  }

  const submissionsSnapshot = await input.transaction.get(
    tripRef.collection("submissions").where("candidateId", "==", input.candidateId),
  );
  const submissions = submissionsSnapshot.docs.map((doc: { id: string; data(): unknown }) => {
    const parsed = submissionDocumentSchema.safeParse(doc.data());
    if (!parsed.success || parsed.data.candidateId !== input.candidateId) {
      throw authError("CONFLICT", "Candidate submission state is malformed.", {
        tripId: input.tripId,
        targetId: doc.id,
      });
    }
    return parsed.data;
  });
  const membership = await loadAuthoritativeMembershipState(input.transaction, input.tripId);

  const cacheKeys = candidateCriticalFactScopeKeys({
    candidateId: input.candidateId,
    timezone: input.trip.timezone,
    startDate: input.trip.startDate,
    endDate: input.trip.endDate,
    activityBudgetCurrency: input.trip.activityBudgetCurrency,
  });
  let snapshotMap: Map<string, StoredExternalSnapshot[]>;
  try {
    snapshotMap = await loadExternalSnapshotsForCacheKeysInTransaction(
      input.transaction,
      input.tripId,
      cacheKeys,
    );
  } catch (error) {
    if (error instanceof ExternalSnapshotStateError) {
      throw authError("CONFLICT", "External snapshot state is malformed.", {
        tripId: input.tripId,
        targetId: input.candidateId,
      });
    }
    throw error;
  }

  const criticalFactSnapshots = [
    ...snapshotMap.values(),
  ].flat();
  if (input.additionalCriticalFactSnapshots) {
    criticalFactSnapshots.push(...input.additionalCriticalFactSnapshots);
  }

  return evaluateCandidateValidation({
    candidateId: input.candidateId,
    candidate: candidate.data,
    trip: input.trip,
    submissions,
    activeMemberIds: membership.activeMemberIds,
    criticalFactSnapshots,
    placeDetailsSnapshot: input.placeDetailsSnapshot,
    placement: input.placement,
  });
}
