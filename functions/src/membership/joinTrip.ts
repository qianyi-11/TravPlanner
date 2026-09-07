import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  joinTripInputSchema,
  joinTripResultSchema,
  tripMemberDocumentSchema,
  tripMembershipProjectionSchema,
  tripIdSchema,
} from "@travel-planner/shared";
import { MAX_ACTIVE_MEMBERS } from "@travel-planner/shared";
import {
  authError,
  getCallerMemberProfile,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireAuth,
} from "../auth";
import { recalculateSafeActivityBudgetCeiling, type MembershipActivityBudget } from "../budget/recalculateSafeActivityBudgetCeiling";
import { parseBudgetForMembership } from "../budget/parseBudgetForMembership";
import { InviteTokenError, validateInviteToken } from "./inviteToken";

const tripIdOnlySchema = z.object({ tripId: tripIdSchema });
const inviteDocumentSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  createdAt: z.unknown(),
  resetAt: z.unknown().optional(),
});

export async function joinTripHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const tripIdResult = tripIdOnlySchema.safeParse(request.data);
  if (!tripIdResult.success) {
    throw authError("INVALID_INPUT", "Trip ID is invalid.");
  }

  const tripId = tripIdResult.data.tripId;
  const result = await getFirestore().runTransaction(async (transaction) => {
    const context = await loadTripAuthContextInTransaction(transaction, tripId, uid);

    if (context.member?.status === "ACTIVE") {
      const state = await loadAuthoritativeMembershipState(transaction, tripId);
      return joinTripResultSchema.parse({
        tripId,
        role: context.member.role,
        status: "ACTIVE",
        alreadyMember: true,
        activeMemberCount: state.activeMemberCount,
        membershipVersion: context.trip.membershipVersion,
        phase: context.trip.phase,
        planningCycle: context.trip.planningCycle,
      });
    }
    if (context.member?.status === "REMOVED") {
      throw authError("MEMBER_INACTIVE", "Trip membership is not active.", { tripId });
    }

    const inviteSnapshot = await transaction.get(
      getFirestore().collection("trips").doc(tripId).collection("private").doc("invite"),
    );
    const state = await loadAuthoritativeMembershipState(transaction, tripId);
    if (!inviteSnapshot.exists) throw authError("NOT_FOUND", "Invite was not found.", { tripId });
    const inviteResult = inviteDocumentSchema.safeParse(inviteSnapshot.data());
    if (!inviteResult.success) throw authError("CONFLICT", "Invite state is invalid.", { tripId });

    if (context.trip.phase !== "COLLECTING") {
      throw authError("MEMBERSHIP_FROZEN", "Membership is frozen for this trip.", {
        tripId,
        phase: context.trip.phase,
      });
    }

    const parsed = joinTripInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw authError("INVALID_INPUT", "Join input is invalid.");
    }

    try {
      validateInviteToken(parsed.data.inviteToken, inviteResult.data.version, inviteResult.data.tokenHash);
    } catch (error) {
      if (error instanceof InviteTokenError) {
        throw authError(error.reason, error.reason === "INVITE_RESET" ? "Invite was reset." : "Invite is invalid.", { tripId });
      }
      throw error;
    }

    if (state.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId });
    }
    if (state.activeMemberCount >= MAX_ACTIVE_MEMBERS) {
      throw authError("LIMIT_EXCEEDED", "The trip already has the maximum active members.", { tripId });
    }

    const profile = getCallerMemberProfile(request);
    const timestamp = FieldValue.serverTimestamp();
    const member = {
      uid,
      ...profile,
      role: "MEMBER" as const,
      status: "ACTIVE" as const,
      joinedAt: timestamp,
    };
    const projection = {
      tripId,
      role: "MEMBER" as const,
      status: "ACTIVE" as const,
      tripName: context.trip.name,
      destinationName: context.trip.destination.name,
      startDate: context.trip.startDate,
      endDate: context.trip.endDate,
      joinedAt: timestamp,
      updatedAt: timestamp,
    };
    tripMemberDocumentSchema.parse(member);
    tripMembershipProjectionSchema.parse(projection);

    const tripRef = getFirestore().collection("trips").doc(tripId);
    const activeMemberIds = [...state.activeMemberIds, uid];
    const budgetSnapshots = await Promise.all(
      activeMemberIds.map(memberId => transaction.get(tripRef.collection("activityBudgets").doc(memberId))),
    );
    const budgets: MembershipActivityBudget[] = budgetSnapshots.flatMap(snapshot => {
      if (!snapshot.exists) return [];
      return [parseBudgetForMembership(snapshot.data(), snapshot.id, tripId)];
    });
    const safeActivityBudgetCeiling = recalculateSafeActivityBudgetCeiling({
      budgets,
      activeMemberIds,
      activeOwnerId: state.activeOwnerId,
      currency: context.trip.activityBudgetCurrency,
    });
    transaction.create(tripRef.collection("members").doc(uid), member);
    transaction.create(getFirestore().collection("users").doc(uid).collection("tripMemberships").doc(tripId), projection);
    transaction.update(tripRef, {
      activeMemberCount: state.activeMemberCount + 1,
      membershipVersion: context.trip.membershipVersion + 1,
      updatedAt: timestamp,
      safeActivityBudgetCeiling: safeActivityBudgetCeiling === undefined ? FieldValue.delete() : safeActivityBudgetCeiling,
    });

    return joinTripResultSchema.parse({
      tripId,
      role: "MEMBER",
      status: "ACTIVE",
      alreadyMember: false,
      activeMemberCount: state.activeMemberCount + 1,
      membershipVersion: context.trip.membershipVersion + 1,
      phase: context.trip.phase,
      planningCycle: context.trip.planningCycle,
    });
  });

  return result;
}

export const joinTrip = onCall({ enforceAppCheck: true }, joinTripHandler);
