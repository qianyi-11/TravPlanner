import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  approvalDocumentSchema,
  itineraryOptionDocumentSchema,
  optionVoteDocumentSchema,
  reviewDraftDocumentSchema,
  selectWinningOptionInputSchema,
  selectWinningOptionResultSchema,
  type ItineraryOptionDocument,
  type OptionVoteDocument,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireAuth,
  requireOwner,
  requirePhase,
  requirePlanningCycle,
} from "../auth";
import { calculateOptionPlurality } from "../voting/optionPlurality";

export async function selectWinningOptionHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = selectWinningOptionInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Winning-option input is invalid.");
  const input = parsed.data;
  const db = getFirestore();

  return db.runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireOwner(context);
    requirePhase(context, ["PLANNING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.activeOwnerId !== uid || membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
    }

    const tripRef = db.collection("trips").doc(input.tripId);
    const optionsRef = tripRef.collection("itineraryOptions");
    const reviewDraftRef = tripRef.collection("reviewDrafts").doc(String(context.trip.planningCycle));

    let selectedOptionId: string;
    let selectedOption: ItineraryOptionDocument;
    let tieBroken = false;

    if (membership.isSolo) {
      if (!input.selectedOptionId || input.tieBreakOptionId) {
        throw authError("INVALID_INPUT", "Solo selection requires selectedOptionId and does not accept tieBreakOptionId.", { tripId: input.tripId });
      }

      const optionSnapshot = await transaction.get(optionsRef.doc(input.selectedOptionId));
      if (!optionSnapshot.exists) {
        throw authError("NOT_FOUND", "Itinerary option was not found.", { tripId: input.tripId, targetId: input.selectedOptionId });
      }
      selectedOption = parseOption(optionSnapshot.data(), input.tripId, input.selectedOptionId);
      if (selectedOption.planningCycle !== context.trip.planningCycle) {
        throw authError("STALE_PLANNING_CYCLE", "The itinerary option is stale.", { tripId: input.tripId, targetId: input.selectedOptionId });
      }
      selectedOptionId = input.selectedOptionId;
    } else {
      if (input.selectedOptionId) {
        throw authError("INVALID_INPUT", "Group selection is determined from current option votes.", { tripId: input.tripId });
      }

      const [optionSnapshots, voteSnapshots] = await Promise.all([
        transaction.get(optionsRef.where("planningCycle", "==", context.trip.planningCycle)),
        transaction.get(tripRef.collection("optionVotes")),
      ]);

      const options = new Map<string, ItineraryOptionDocument>();
      for (const snapshot of optionSnapshots.docs) {
        options.set(snapshot.id, parseOption(snapshot.data(), input.tripId, snapshot.id));
      }
      const votes = voteSnapshots.docs.map(snapshot => parseVote(snapshot.data(), input.tripId, snapshot.id));
      const plurality = calculateOptionPlurality({
        votes,
        activeMemberIds: membership.activeMemberIds,
        eligibleOptionIds: [...options.keys()],
        planningCycle: context.trip.planningCycle,
      });

      if (plurality.validVoteCount === 0) {
        throw authError("NO_OPTION_VOTES", "No current valid option votes are available.", { tripId: input.tripId });
      }

      if (plurality.isTie) {
        if (!input.tieBreakOptionId) {
          throw authError("CONFLICT", "The top option vote is tied and requires an OWNER tie-break.", {
            tripId: input.tripId,
            tiedOptionIds: plurality.tiedOptionIds,
          });
        }
        if (!plurality.tiedOptionIds.includes(input.tieBreakOptionId)) {
          throw authError("INVALID_INPUT", "tieBreakOptionId must belong to the true tied top set.", {
            tripId: input.tripId,
            targetId: input.tieBreakOptionId,
          });
        }
        selectedOptionId = input.tieBreakOptionId;
        tieBroken = true;
      } else {
        if (input.tieBreakOptionId) {
          throw authError("INVALID_INPUT", "tieBreakOptionId is allowed only for a true top tie.", {
            tripId: input.tripId,
            targetId: input.tieBreakOptionId,
          });
        }
        if (!plurality.winnerOptionId) {
          throw authError("CONFLICT", "A winning option could not be resolved.", { tripId: input.tripId });
        }
        selectedOptionId = plurality.winnerOptionId;
      }

      const resolvedOption = options.get(selectedOptionId);
      if (!resolvedOption) {
        throw authError("CONFLICT", "The resolved winning option is not current authority.", {
          tripId: input.tripId,
          targetId: selectedOptionId,
        });
      }
      selectedOption = resolvedOption;
    }

    const existingDraft = await transaction.get(reviewDraftRef);
    if (existingDraft.exists) {
      throw authError("CONFLICT", "A review draft already exists for the current planning cycle.", {
        tripId: input.tripId,
        targetId: String(context.trip.planningCycle),
      });
    }

    const timestamp = FieldValue.serverTimestamp();
    const reviewDraft = {
      planningCycle: context.trip.planningCycle,
      sourceOptionId: selectedOptionId,
      revision: 1,
      days: selectedOption.days,
      validationSnapshotId: selectedOption.validationSnapshotId,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: uid,
    };
    reviewDraftDocumentSchema.parse(reviewDraft);

    let approvalId: string | undefined;
    if (!membership.isSolo) {
      const approvalRef = tripRef.collection("approvals").doc();
      approvalId = approvalRef.id;
      const approval = {
        type: "FINAL_ITINERARY" as const,
        planningCycle: context.trip.planningCycle,
        subjectType: "REVIEW_DRAFT" as const,
        subjectId: String(context.trip.planningCycle),
        subjectRevision: 1,
        status: "PENDING" as const,
        yesCount: 0,
        noCount: 0,
        createdBy: uid,
        createdAt: timestamp,
      };
      approvalDocumentSchema.parse(approval);
      transaction.create(approvalRef, approval);
    }

    transaction.create(reviewDraftRef, reviewDraft);
    transaction.update(tripRef, {
      selectedOptionId,
      phase: "REVIEW",
      updatedAt: timestamp,
    });

    return selectWinningOptionResultSchema.parse({
      selectedOptionId,
      reviewDraftRevision: 1,
      phase: "REVIEW",
      ...(approvalId ? { approvalId } : {}),
      ...(tieBroken ? { tieBroken: true } : {}),
    });
  });
}

export const selectWinningOption = onCall({ enforceAppCheck: true }, selectWinningOptionHandler);

function parseOption(data: unknown, tripId: string, optionId: string): ItineraryOptionDocument {
  const parsed = itineraryOptionDocumentSchema.safeParse(data);
  if (!parsed.success) {
    throw authError("CONFLICT", "Itinerary option state is invalid.", { tripId, targetId: optionId });
  }
  return parsed.data;
}

function parseVote(data: unknown, tripId: string, voteId: string): OptionVoteDocument {
  const parsed = optionVoteDocumentSchema.safeParse(data);
  if (!parsed.success) {
    throw authError("CONFLICT", "Option vote state is invalid.", { tripId, targetId: voteId });
  }
  return parsed.data;
}
