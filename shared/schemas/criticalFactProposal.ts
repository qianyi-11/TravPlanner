import { z } from "zod";
import {
  dateStringSchema,
  firestoreTimestampSchema,
  isValidDayWindow,
  positiveMinutesSchema,
  timeStringSchema,
} from "./common";

const priceCostStatuses = ["CONFIRMED", "ESTIMATED"] as const;
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

const criticalFactInputUnion = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("DURATION"),
    durationMinutes: positiveMinutesSchema,
  }).strict(),
  z.object({
    type: z.literal("VISIT_WINDOW"),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
  }).strict(),
  z.object({
    type: z.literal("PRICE"),
    amount: z.number().finite().nonnegative(),
    costStatus: z.enum(priceCostStatuses),
  }).strict(),
]);

export const criticalFactSchema = criticalFactInputUnion.superRefine((value, ctx) => {
  if (
    value.type === "VISIT_WINDOW" &&
    !isValidDayWindow(value.startTime, value.endTime)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "Visit window must start before it ends",
    });
  }
});

const persistedCriticalFactUnion = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("DURATION"),
    durationMinutes: positiveMinutesSchema,
  }).strict(),
  z.object({
    type: z.literal("VISIT_WINDOW"),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
  }).strict(),
  z.object({
    type: z.literal("PRICE"),
    amount: z.number().finite().nonnegative(),
    costStatus: z.enum(priceCostStatuses),
    currency: currencyCodeSchema,
  }).strict(),
]);

export const persistedCriticalFactSchema = persistedCriticalFactUnion.superRefine(
  (value, ctx) => {
    if (
      value.type === "VISIT_WINDOW" &&
      !isValidDayWindow(value.startTime, value.endTime)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Visit window must start before it ends",
      });
    }
  },
);

const proposalBaseShape = {
  candidateId: z.string().min(1),
  fact: persistedCriticalFactSchema,
  proposedBy: z.string().min(1),
  note: z.string().max(1000).optional(),
  createdAt: firestoreTimestampSchema,
  updatedAt: firestoreTimestampSchema,
};

export const criticalFactProposalDocumentSchema = z.discriminatedUnion("status", [
  z.object({
    ...proposalBaseShape,
    status: z.literal("PENDING"),
  }).strict(),
  z.object({
    ...proposalBaseShape,
    status: z.literal("CONFIRMED"),
    confirmedBy: z.string().min(1),
    confirmedAt: firestoreTimestampSchema,
  }).strict(),
  z.object({
    ...proposalBaseShape,
    status: z.literal("REJECTED"),
    rejectedBy: z.string().min(1),
    rejectedAt: firestoreTimestampSchema,
  }).strict(),
]);

export type CriticalFact = z.infer<typeof criticalFactSchema>;
export type PersistedCriticalFact = z.infer<typeof persistedCriticalFactSchema>;
export type CriticalFactProposalDocument =
  z.infer<typeof criticalFactProposalDocumentSchema>;
