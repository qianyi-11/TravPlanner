import { z } from "zod";
import { supportedCurrencyCodeSchema } from "../constants";
import { TRANSPORT_MODES } from "../enums";
import { baseLocationSchema, dateStringSchema, dayOverrideSchema, dayWindowSchema } from "../schemas";
import { expectedPlanningCycleSchema, tripIdSchema } from "./common";
import { validateEffectiveTripSetup } from "../validation/tripSetup";

export const createTripInputSchema = z.object({
  name: z.string().min(1),
  destinationPlaceId: z.string().min(1),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  baseLocation: baseLocationSchema,
  defaultDayWindow: dayWindowSchema,
  dayOverrides: z.array(dayOverrideSchema).default([]),
  primaryTransport: z.enum(TRANSPORT_MODES),
  activityBudgetCurrency: supportedCurrencyCodeSchema,

}).superRefine((value, ctx) => {
  if (!validateEffectiveTripSetup(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "Invalid effective trip setup" });
  }
});

export const createTripResultSchema = z.object({
  tripId: tripIdSchema,
  inviteToken: z.string().min(16),
});

export const updateTripSetupInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  patch: z.object({
    name: z.string().min(1).optional(),
    destinationPlaceId: z.string().min(1).optional(),
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),
    baseLocation: baseLocationSchema.optional(),
    defaultDayWindow: dayWindowSchema.optional(),
    dayOverrides: z.array(dayOverrideSchema).optional(),
    primaryTransport: z.enum(TRANSPORT_MODES).optional(),
    activityBudgetCurrency: supportedCurrencyCodeSchema.optional(),
  // Partial patches cannot be checked for effective dates/windows here.
  // Backend must merge with the stored trip and call validateEffectiveTripSetup.
  }).refine(v => Object.keys(v).length > 0, "Patch cannot be empty"),
});

export const updateTripSetupResultSchema = z.object({
  tripId: tripIdSchema,
  updated: z.literal(true),
});

export const reopenTripPhaseInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  targetPhase: z.enum(["COLLECTING", "VOTING"]),
  reason: z.string().max(500).optional(),
});

export const reopenTripPhaseResultSchema = z.object({
  tripId: tripIdSchema,
  phase: z.enum(["COLLECTING", "VOTING"]),
  planningCycle: z.number().int().positive(),
});

export const deleteTripInputSchema = z.object({ tripId: tripIdSchema });
export const deleteTripResultSchema = z.object({ tripId: tripIdSchema, deleted: z.literal(true) });

export type CreateTripInput = z.infer<typeof createTripInputSchema>;
export type CreateTripResult = z.infer<typeof createTripResultSchema>;
export type UpdateTripSetupInput = z.infer<typeof updateTripSetupInputSchema>;
export type UpdateTripSetupResult = z.infer<typeof updateTripSetupResultSchema>;
export type ReopenTripPhaseInput = z.infer<typeof reopenTripPhaseInputSchema>;
export type ReopenTripPhaseResult = z.infer<typeof reopenTripPhaseResultSchema>;
export type DeleteTripInput = z.infer<typeof deleteTripInputSchema>;
export type DeleteTripResult = z.infer<typeof deleteTripResultSchema>;
