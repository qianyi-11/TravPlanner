import { z } from "zod";
import { MEMBERSHIP_IMPACT_REASON_CODES, TRIP_PHASES } from "../enums";
import { expectedPlanningCycleSchema, memberIdSchema, tripIdSchema } from "./common";

export const joinTripInputSchema = z.object({
  tripId: tripIdSchema,
  inviteToken: z.string().min(16),
});
export const joinTripResultSchema = z.object({
  tripId: tripIdSchema,
  role: z.enum(["OWNER", "MEMBER"]),
  status: z.literal("ACTIVE"),
  alreadyMember: z.boolean(),
  activeMemberCount: z.number().int().nonnegative(),
  membershipVersion: z.number().int().positive(),
  phase: z.enum(TRIP_PHASES),
  planningCycle: z.number().int().positive(),
});

export const resetInviteInputSchema = z.object({ tripId: tripIdSchema });
export const resetInviteResultSchema = z.object({
  inviteToken: z.string().min(16),
  inviteVersion: z.number().int().positive(),
});

export const removeMemberInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  memberId: memberIdSchema,
});
export const removeMemberResultSchema = z.object({
  memberId: memberIdSchema,
  changed: z.boolean(),
  activeMemberCount: z.number().int().nonnegative(),
  membershipVersion: z.number().int().positive(),
  phase: z.enum(TRIP_PHASES),
  planningCycle: z.number().int().positive(),
  workflowReopened: z.boolean(),
  impactReasonCodes: z.array(z.enum(MEMBERSHIP_IMPACT_REASON_CODES)),
});

export const transferOwnershipInputSchema = z.object({
  tripId: tripIdSchema,
  newOwnerId: memberIdSchema,
});
export const transferOwnershipResultSchema = z.object({
  previousOwnerId: memberIdSchema,
  ownerId: memberIdSchema,
  changed: z.boolean(),
  membershipVersion: z.number().int().positive(),
});

export const leaveTripInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
});
export const leaveTripResultSchema = z.object({
  changed: z.boolean(),
  activeMemberCount: z.number().int().nonnegative(),
  membershipVersion: z.number().int().positive(),
  phase: z.enum(TRIP_PHASES),
  planningCycle: z.number().int().positive(),
  workflowReopened: z.boolean(),
  impactReasonCodes: z.array(z.enum(MEMBERSHIP_IMPACT_REASON_CODES)),
});

export type JoinTripInput = z.infer<typeof joinTripInputSchema>;
export type JoinTripResult = z.infer<typeof joinTripResultSchema>;
export type ResetInviteInput = z.infer<typeof resetInviteInputSchema>;
export type ResetInviteResult = z.infer<typeof resetInviteResultSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;
export type RemoveMemberResult = z.infer<typeof removeMemberResultSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInputSchema>;
export type TransferOwnershipResult = z.infer<typeof transferOwnershipResultSchema>;
export type LeaveTripInput = z.infer<typeof leaveTripInputSchema>;
export type LeaveTripResult = z.infer<typeof leaveTripResultSchema>;
