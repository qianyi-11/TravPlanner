import { z } from "zod";
import { TRANSPORT_MODES, TRIP_PHASES } from "../enums";
import { baseLocationSchema, dateStringSchema, dayOverrideSchema, dayWindowSchema, firestoreTimestampSchema, locationRefSchema } from "./common";
import { validateEffectiveTripSetup } from "../validation/tripSetup";
// activeMemberCount is a denormalized read/UI optimization, never the sole
// source for security-sensitive solo/group decisions.
export const tripDocumentSchema = z.object({ name: z.string().min(1), ownerId: z.string().min(1), phase: z.enum(TRIP_PHASES), planningCycle: z.number().int().positive(), membershipVersion: z.number().int().positive(), votingBasisMembershipVersion: z.number().int().positive().optional(), destination: locationRefSchema.extend({ placeId: z.string().min(1) }), startDate: dateStringSchema, endDate: dateStringSchema, timezone: z.string().min(1), baseLocation: baseLocationSchema, defaultDayWindow: dayWindowSchema, dayOverrides: z.array(dayOverrideSchema), primaryTransport: z.enum(TRANSPORT_MODES), activityBudgetCurrency: z.string().min(1), activeMemberCount: z.number().int().nonnegative(), safeActivityBudgetCeiling: z.number().finite().nonnegative().optional(), selectedOptionId: z.string().min(1).optional(), currentItineraryVersionId: z.string().min(1).optional(), createdAt: firestoreTimestampSchema, updatedAt: firestoreTimestampSchema })
  .superRefine((value, ctx) => {
    if (!validateEffectiveTripSetup(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "Invalid effective trip setup" });
    }
  });
export type TripDocument = z.infer<typeof tripDocumentSchema>;
