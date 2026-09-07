import { FieldValue, getFirestore, type DocumentReference, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import {
  tripMemberDocumentSchema,
  tripMembershipProjectionSchema,
  selfLeaveReceiptSchema,
  type TripDocument,
  type TripMemberDocument,
  removeMemberResultSchema,
  leaveTripResultSchema,
  candidateDocumentSchema,
  legacyCandidateVoteReadSchema,
} from "@travel-planner/shared";
import { authError, loadAuthoritativeMembershipState, loadTripAuthContextInTransaction, requireActiveMember, requireOwner, requirePlanningCycle } from "../auth";
import { recalculateMembershipCandidateState, type MembershipCandidateRecord, type MembershipCandidateVoteRecord, type MembershipSubmissionRecord } from "../candidates/recalculateMembershipCandidateState";
import { recalculateSafeActivityBudgetCeiling, type MembershipActivityBudget } from "../budget/recalculateSafeActivityBudgetCeiling";
import { parseBudgetForMembership } from "../budget/parseBudgetForMembership";
import { evaluateMembershipImpact } from "./evaluateMembershipImpact";
import { resetMembershipShortlistState, type MembershipShortlistCandidate } from "../shortlist/resetMembershipShortlistState";
import { recalculateMembershipVoteState, type MembershipCandidateVote, type MembershipOptionVote } from "../voting/recalculateMembershipVoteState";
import { recalculateMembershipApprovals, type MembershipApproval, type MembershipApprovalResponse } from "../review/recalculateMembershipApprovals";
import { candidateIdFromPlaceId } from "../candidates/candidateIdentity";
import { isCandidateVoteIdentity } from "../voting/candidateVoteIdentity";

export interface ApplyMembershipRemovalInput {
  tripId: string;
  actorUid: string;
  targetUid: string;
  expectedPlanningCycle: number;
  removalKind: "SELF_LEAVE" | "OWNER_REMOVAL";
}

type RemovalResult = ReturnType<typeof removeMemberResultSchema.parse> | ReturnType<typeof leaveTripResultSchema.parse>;

interface ApprovalRecord extends MembershipApproval {
  planningCycle?: number;
  subjectType?: string;
  subjectId?: string;
  responses: readonly MembershipApprovalResponse[];
}

interface ChangeRequestRecord {
  approvalId?: string;
  status?: string;
  resultingVersionId?: string;
}

export async function applyMembershipRemoval(
  input: ApplyMembershipRemovalInput,
): Promise<RemovalResult> {
  return getFirestore().runTransaction(async transaction => {
    const db = getFirestore();
    const tripRef = db.collection("trips").doc(input.tripId);
    const targetRef = tripRef.collection("members").doc(input.targetUid);

    let trip: TripDocument;
    let actorMember: TripMemberDocument | null;
    let targetSnapshot: DocumentSnapshot;
    let currentState;

    if (input.removalKind === "SELF_LEAVE") {
      targetSnapshot = await transaction.get(targetRef);
      if (!targetSnapshot.exists) {
        throw authError("NOT_MEMBER", "Caller is not a trip member.", { tripId: input.tripId });
      }
      actorMember = targetSnapshot.data() as TripMemberDocument;
      trip = undefined as never;

      if (actorMember.status === "REMOVED") {
        const receiptResult = actorMember.removalKind === "SELF_LEAVE"
          ? selfLeaveReceiptSchema.safeParse(actorMember.selfLeaveReceipt)
          : selfLeaveReceiptSchema.safeParse(undefined);
        if (receiptResult.success) {
          const receipt = receiptResult.data;
          return leaveTripResultSchema.parse({
            changed: false,
            ...receipt,
            workflowReopened: false,
            impactReasonCodes: [],
          });
        }
        throw authError("MEMBER_INACTIVE", "Trip membership is not active.", { tripId: input.tripId });
      }

      const tripSnapshot = await transaction.get(tripRef);
      if (!tripSnapshot.exists) throw authError("NOT_FOUND", "Trip was not found.", { tripId: input.tripId });
      trip = tripSnapshot.data() as TripDocument;
      if (actorMember.role === "OWNER") {
        throw authError("CONFLICT", "The OWNER must transfer ownership before leaving.", { tripId: input.tripId });
      }
      currentState = await loadAuthoritativeMembershipState(transaction, input.tripId);
      if (currentState.activeOwnerId !== trip.ownerId || !currentState.activeOwnerId) {
        throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
      }
    } else {
      const context = await loadTripAuthContextInTransaction(transaction, input.tripId, input.actorUid);
      requireOwner(context);
      trip = context.trip;
      actorMember = context.member;
      targetSnapshot = await transaction.get(targetRef);
      if (!targetSnapshot.exists) {
        throw authError("NOT_FOUND", "Target membership was not found.", { tripId: input.tripId, targetId: input.targetUid });
      }
      currentState = await loadAuthoritativeMembershipState(transaction, input.tripId);
      if (currentState.activeOwnerId !== trip.ownerId || !currentState.activeOwnerId) {
        throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
      }
      actorMember = context.member;
    }

    const targetMember = tripMemberDocumentSchema.parse(targetSnapshot.data());
    if (targetMember.status === "REMOVED") {
      if (input.removalKind !== "OWNER_REMOVAL") {
        throw authError("MEMBER_INACTIVE", "Trip membership is not active.", { tripId: input.tripId });
      }
      return removeMemberResultSchema.parse({
        memberId: input.targetUid,
        changed: false,
        activeMemberCount: currentState.activeMemberCount,
        membershipVersion: trip.membershipVersion,
        phase: trip.phase,
        planningCycle: trip.planningCycle,
        workflowReopened: false,
        impactReasonCodes: [],
      });
    }

    if (input.removalKind === "SELF_LEAVE") {
      requireActiveMember({ uid: input.actorUid, tripId: input.tripId, trip, member: actorMember });
      if (targetMember.role === "OWNER") {
        throw authError("CONFLICT", "The OWNER must transfer ownership before leaving.", { tripId: input.tripId });
      }
    } else if (targetMember.role === "OWNER") {
      throw authError("CONFLICT", "The ACTIVE OWNER cannot be removed.", { tripId: input.tripId });
    }

    if (!currentState.activeMemberIds.includes(input.targetUid)) {
      throw authError("CONFLICT", "Active membership authority is inconsistent.", { tripId: input.tripId });
    }

    if (trip.phase !== "FINALIZED") requirePlanningCycle({ uid: input.actorUid, tripId: input.tripId, trip, member: actorMember }, input.expectedPlanningCycle);

    const activeMemberIds = currentState.activeMemberIds;
    const postRemovalMemberIds = activeMemberIds.filter(uid => uid !== input.targetUid);
    const postRemovalState = {
      ...currentState,
      activeMemberIds: postRemovalMemberIds,
      activeMemberCount: postRemovalMemberIds.length,
      isSolo: postRemovalMemberIds.length === 1,
    };
    if (postRemovalState.activeMemberCount < 1 || postRemovalState.activeOwnerId !== currentState.activeOwnerId) {
      throw authError("CONFLICT", "A trip must retain exactly one ACTIVE OWNER.", { tripId: input.tripId });
    }

    const candidatesSnapshot = await transaction.get(tripRef.collection("candidates"));
    const submissionsSnapshot = await transaction.get(tripRef.collection("submissions"));
    const candidateVotesSnapshot = await transaction.get(tripRef.collection("candidateVotes").where("planningCycle", "==", trip.planningCycle));
    const optionsSnapshot = await transaction.get(tripRef.collection("itineraryOptions").where("planningCycle", "==", trip.planningCycle));
    const optionVotesSnapshot = await transaction.get(tripRef.collection("optionVotes").where("planningCycle", "==", trip.planningCycle));
    const reviewDraftSnapshot = await transaction.get(tripRef.collection("reviewDrafts").doc(String(trip.planningCycle)));
    const budgetSnapshots = await Promise.all(
      postRemovalMemberIds.map(uid => transaction.get(tripRef.collection("activityBudgets").doc(uid))),
    );

    const candidateRecords: MembershipCandidateRecord[] = candidatesSnapshot.docs.map(snapshot => {
      const parsed = candidateDocumentSchema.safeParse(snapshot.data());
      if (!parsed.success || candidateIdFromPlaceId(parsed.data.placeId) !== snapshot.id) {
        throw authError("CONFLICT", "Candidate state is invalid.", { tripId: input.tripId, targetId: snapshot.id });
      }
      return { candidateId: snapshot.id, active: parsed.data.active, activationVersion: parsed.data.activationVersion };
    });
    const submissions: MembershipSubmissionRecord[] = submissionsSnapshot.docs.map(snapshot => snapshot.data() as MembershipSubmissionRecord);
    const candidateVotes: MembershipCandidateVoteRecord[] = candidateVotesSnapshot.docs.map(snapshot => {
      const parsed = legacyCandidateVoteReadSchema.safeParse(snapshot.data());
      if (!parsed.success || !isCandidateVoteIdentity(snapshot.id, parsed.data)) {
        throw authError("CONFLICT", "Candidate vote state is invalid.", { tripId: input.tripId, targetId: snapshot.id });
      }
      return parsed.data;
    });
    const options = optionsSnapshot.docs.map(snapshot => ({ id: snapshot.id, data: snapshot.data() }));
    const optionVotes: MembershipOptionVote[] = optionVotesSnapshot.docs.map(snapshot => snapshot.data() as MembershipOptionVote);
    const shortlistCandidates: MembershipShortlistCandidate[] = candidatesSnapshot.docs.map(snapshot => {
      const data = snapshot.data();
      return { candidateId: data.candidateId ?? snapshot.id, shortlistStatus: data.shortlistStatus ?? "PENDING" };
    });
    const beforeCandidateState = recalculateMembershipCandidateState({ candidates: candidateRecords, submissions, candidateVotes, activeMemberIds, planningCycle: trip.planningCycle });
    const afterCandidateState = recalculateMembershipCandidateState({ candidates: candidateRecords, submissions, candidateVotes, activeMemberIds: postRemovalMemberIds, planningCycle: trip.planningCycle });
    const candidateVoteCandidates = candidateRecords;
    const eligibleOptionIds = options.map(option => option.id);
    const beforeVoteState = recalculateMembershipVoteState({ candidateVotes, optionVotes, activeMemberIds, planningCycle: trip.planningCycle, candidates: candidateVoteCandidates, eligibleOptionIds });
    const afterVoteState = recalculateMembershipVoteState({ candidateVotes, optionVotes, activeMemberIds: postRemovalMemberIds, planningCycle: trip.planningCycle, candidates: candidateVoteCandidates, eligibleOptionIds });

    const currentReviewDays = reviewDraftSnapshot.exists ? reviewDraftSnapshot.data()?.days : undefined;
    const artifactCandidateIds = new Set<string>([
      ...options.flatMap(option => candidateIdsFromDays(option.data.days)),
      ...candidateIdsFromDays(currentReviewDays),
      ...shortlistCandidates.filter(candidate => candidate.shortlistStatus !== "PENDING").map(candidate => candidate.candidateId),
    ]);
    const changedCandidateIds = symmetricDifference(
      new Set([...beforeCandidateState.supportedCandidateIds, ...beforeCandidateState.mustDoCandidateIds]),
      new Set([...afterCandidateState.supportedCandidateIds, ...afterCandidateState.mustDoCandidateIds]),
    );
    const groupBecameSolo = currentState.activeMemberCount > 1 && postRemovalState.activeMemberCount === 1;
    const shortlistChanged = groupBecameSolo && shortlistCandidates.some(candidate => candidate.shortlistStatus !== "PENDING")
      || [...changedCandidateIds].some(id => shortlistCandidates.some(candidate => candidate.candidateId === id && candidate.shortlistStatus !== "PENDING"));
    const candidateAffectsCurrentArtifacts = [...changedCandidateIds].some(id => artifactCandidateIds.has(id));
    const optionOutcomeChanged = !sameOptionOutcome(beforeVoteState.optionPlurality, afterVoteState.optionPlurality);

    const actionableApprovals = await loadActionableApprovals(transaction, tripRef, trip);
    const approvalBefore = recalculateMembershipApprovals({ approvals: actionableApprovals, activeMemberIds });
    const approvalAfter = recalculateMembershipApprovals({ approvals: actionableApprovals, activeMemberIds: postRemovalMemberIds });
    const approvalStateChanged = approvalBefore.some((before, index) => {
      const after = approvalAfter[index];
      return before.status !== after.status || before.yesCount !== after.yesCount || before.noCount !== after.noCount;
    });

    const budgets: MembershipActivityBudget[] = budgetSnapshots.flatMap(snapshot => {
      if (!snapshot.exists) return [];
      return [parseBudgetForMembership(snapshot.data(), snapshot.id, input.tripId)];
    });
    const safeActivityBudgetCeiling = recalculateSafeActivityBudgetCeiling({
      budgets,
      activeMemberIds: postRemovalMemberIds,
      activeOwnerId: currentState.activeOwnerId,
      currency: trip.activityBudgetCurrency,
    });
    const decision = evaluateMembershipImpact({
      phase: trip.phase,
      planningCycle: trip.planningCycle,
      activeMemberCountBefore: currentState.activeMemberCount,
      activeMemberCountAfter: postRemovalState.activeMemberCount,
      hasCurrentCycleOptions: options.length > 0,
      hasCurrentCycleReviewArtifact: reviewDraftSnapshot.exists,
      candidateSupportChanged: !sameSet(beforeCandidateState.supportedCandidateIds, afterCandidateState.supportedCandidateIds),
      mustDoSetChanged: !sameSet(beforeCandidateState.mustDoCandidateIds, afterCandidateState.mustDoCandidateIds),
      candidateAffectsCurrentArtifacts,
      shortlistChanged,
      optionOutcomeChanged,
      approvalStateChanged,
    });
    const finalCandidateState = decision.nextPhase === "COLLECTING"
      ? recalculateMembershipCandidateState({
        candidates: candidateRecords,
        submissions,
        candidateVotes: [],
        activeMemberIds: postRemovalMemberIds,
        planningCycle: trip.planningCycle + 1,
      })
      : afterCandidateState;
    const timestamp = FieldValue.serverTimestamp();
    const memberUpdate: Record<string, unknown> = {
      status: "REMOVED",
      removedAt: timestamp,
      removedBy: input.actorUid,
      removalKind: input.removalKind,
    };
    if (input.removalKind === "SELF_LEAVE") {
      memberUpdate.selfLeaveReceipt = {
        activeMemberCount: postRemovalState.activeMemberCount,
        membershipVersion: trip.membershipVersion + 1,
        phase: decision.nextPhase,
        planningCycle: decision.nextPlanningCycle,
      };
    } else {
      memberUpdate.selfLeaveReceipt = FieldValue.delete();
    }
    transaction.update(targetRef, memberUpdate);

    const projectionRef = db.collection("users").doc(input.targetUid).collection("tripMemberships").doc(input.tripId);
    const projection = { tripId: input.tripId, role: targetMember.role, status: "REMOVED" as const, updatedAt: timestamp };
    tripMembershipProjectionSchema.partial().parse(projection);
    transaction.set(projectionRef, projection, { merge: true });

    const tripUpdate: Record<string, unknown> = {
      activeMemberCount: postRemovalState.activeMemberCount,
      membershipVersion: trip.membershipVersion + 1,
      phase: decision.nextPhase,
      planningCycle: decision.nextPlanningCycle,
      updatedAt: timestamp,
      safeActivityBudgetCeiling: safeActivityBudgetCeiling === undefined ? FieldValue.delete() : safeActivityBudgetCeiling,
    };
    if (decision.clearSelectedOptionId) tripUpdate.selectedOptionId = FieldValue.delete();
    if (decision.nextPhase === "COLLECTING") tripUpdate.votingBasisMembershipVersion = FieldValue.delete();
    transaction.update(tripRef, tripUpdate);

    const shortlistPatches = resetMembershipShortlistState(shortlistCandidates, decision.resetShortlist);
    const candidateUpdates = new Map<string, Record<string, unknown>>();
    for (const patch of finalCandidateState.deactivatePatches) candidateUpdates.set(patch.candidateId, { active: false, updatedAt: timestamp });
    for (const patch of shortlistPatches) candidateUpdates.set(patch.candidateId, { ...(candidateUpdates.get(patch.candidateId) ?? {}), shortlistStatus: patch.shortlistStatus, updatedAt: timestamp });
    for (const [candidateId, update] of candidateUpdates) transaction.update(tripRef.collection("candidates").doc(candidateId), update);

    if (trip.phase === "FINALIZED" && postRemovalState.isSolo) {
      for (const approval of actionableApprovals) {
        transaction.update(tripRef.collection("approvals").doc(approval.approvalId), { status: "STALE" });
      }
    } else {
      for (const [index, result] of approvalAfter.entries()) {
        const before = approvalBefore[index];
        if (before.status === result.status && before.yesCount === result.yesCount && before.noCount === result.noCount) continue;
        transaction.update(tripRef.collection("approvals").doc(result.approvalId), {
          status: result.status,
          yesCount: result.yesCount,
          noCount: result.noCount,
          resolvedAt: result.resolved ? timestamp : FieldValue.delete(),
        });
      }
    }

    const result = {
      changed: true as const,
      activeMemberCount: postRemovalState.activeMemberCount,
      membershipVersion: trip.membershipVersion + 1,
      phase: decision.nextPhase,
      planningCycle: decision.nextPlanningCycle,
      workflowReopened: decision.workflowReopened,
      impactReasonCodes: decision.impactReasonCodes,
    };
    return input.removalKind === "OWNER_REMOVAL"
      ? removeMemberResultSchema.parse({ memberId: input.targetUid, ...result })
      : leaveTripResultSchema.parse(result);
  });
}

async function loadActionableApprovals(
  transaction: Transaction,
  tripRef: DocumentReference,
  trip: TripDocument,
): Promise<ApprovalRecord[]> {
  const approvalsRef = tripRef.collection("approvals");
  const approvalSnapshots = await transaction.get(
    trip.phase === "FINALIZED"
      ? approvalsRef.where("status", "in", ["PENDING", "APPROVED"])
      : approvalsRef.where("planningCycle", "==", trip.planningCycle),
  );
  let records = approvalSnapshots.docs
    .map(snapshot => ({ approvalId: snapshot.id, ...snapshot.data() } as ApprovalRecord))
    .filter(approval => trip.phase === "FINALIZED" || approval.status !== "STALE");

  if (trip.phase === "FINALIZED") {
    const changeRequests = await transaction.get(
      tripRef.collection("changeRequests").where("status", "in", ["PENDING", "APPROVED", "NEEDS_REVALIDATION"]),
    );
    const referencedApprovalIds = new Set(
      changeRequests.docs
        .map(snapshot => snapshot.data() as ChangeRequestRecord)
        .filter(request => request.approvalId && !request.resultingVersionId)
        .map(request => request.approvalId as string),
    );
    records = records.filter(approval => (
      approval.subjectType === "BACKUP" || referencedApprovalIds.has(approval.approvalId)
    ));
    const appliedBackup = await Promise.all(records
      .filter(approval => approval.subjectType === "BACKUP" && approval.subjectId)
      .map(async approval => {
        const snapshot = await transaction.get(
          tripRef.collection("itineraryVersions").where("appliedBackupId", "==", approval.subjectId).limit(1),
        );
        return [approval.approvalId, snapshot.empty] as const;
      }));
    const unappliedBackups = new Map(appliedBackup);
    records = records.filter(approval => approval.subjectType !== "BACKUP" || unappliedBackups.get(approval.approvalId));
  }

  const withResponses = await Promise.all(records.map(async approval => {
    const responses = await transaction.get(approvalsRef.doc(approval.approvalId).collection("responses"));
    return { ...approval, responses: responses.docs.map(snapshot => snapshot.data() as MembershipApprovalResponse) };
  }));
  return withResponses;
}

function candidateIdsFromDays(days: unknown): string[] {
  if (!Array.isArray(days)) return [];
  return days.flatMap(day => {
    if (!day || typeof day !== "object" || !Array.isArray((day as { items?: unknown }).items)) return [];
    return (day as { items: unknown[] }).items.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const candidateId = (item as { candidateId?: unknown }).candidateId;
      return typeof candidateId === "string" ? [candidateId] : [];
    });
  });
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(value => right.includes(value));
}

function symmetricDifference(left: Set<string>, right: Set<string>): Set<string> {
  return new Set([...left, ...right].filter(value => left.has(value) !== right.has(value)));
}

function sameOptionOutcome(
  left: { winnerOptionId?: string; tiedOptionIds: string[]; isTie: boolean },
  right: { winnerOptionId?: string; tiedOptionIds: string[]; isTie: boolean },
): boolean {
  return left.winnerOptionId === right.winnerOptionId && left.isTie === right.isTie && sameSet(left.tiedOptionIds, right.tiedOptionIds);
}
