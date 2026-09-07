import { z } from "zod";
import { TRIP_PHASES } from "../enums";
import { firestoreTimestampSchema } from "./common";

export const selfLeaveReceiptSchema = z.object({
  activeMemberCount: z.number().int().nonnegative(),
  membershipVersion: z.number().int().positive(),
  phase: z.enum(TRIP_PHASES),
  planningCycle: z.number().int().positive(),
}).strict();

export const tripMemberDocumentSchema = z.object({ uid: z.string().min(1), displayName: z.string().min(1), photoURL: z.string().url().optional(), role: z.enum(["OWNER", "MEMBER"]), status: z.enum(["ACTIVE", "REMOVED"]), joinedAt: firestoreTimestampSchema, removedAt: firestoreTimestampSchema.optional(), removedBy: z.string().min(1).optional(), removalKind: z.enum(["SELF_LEAVE", "OWNER_REMOVAL"]).optional(), selfLeaveReceipt: selfLeaveReceiptSchema.optional() });
export const tripMembershipProjectionSchema = z.object({ tripId: z.string().min(1), role: z.enum(["OWNER", "MEMBER"]), status: z.enum(["ACTIVE", "REMOVED"]), tripName: z.string().min(1), destinationName: z.string().min(1), startDate: z.string(), endDate: z.string(), joinedAt: firestoreTimestampSchema, updatedAt: firestoreTimestampSchema });
export type TripMemberDocument = z.infer<typeof tripMemberDocumentSchema>;
export type TripMembershipProjection = z.infer<typeof tripMembershipProjectionSchema>;
