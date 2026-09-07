import { z } from "zod";
import {
  dateStringSchema,
  firestoreTimestampSchema,
  positiveMinutesSchema,
  timeStringSchema,
} from "./common";

const bookingBaseFields = {
  candidateId: z.string().min(1),
  date: dateStringSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  durationMinutes: positiveMinutesSchema,
  reportedBy: z.string().min(1),
  reportedAt: firestoreTimestampSchema,
};

export const pendingBookingSchema = z
  .object({
    ...bookingBaseFields,
    status: z.literal("PENDING_CONFIRMATION"),
  })
  .strict();

export const confirmedBookingSchema = z
  .object({
    ...bookingBaseFields,
    status: z.literal("CONFIRMED"),
    confirmedBy: z.string().min(1),
    confirmedAt: firestoreTimestampSchema,
  })
  .strict();

export const fixedBookingDocumentSchema = z.union([
  pendingBookingSchema,
  confirmedBookingSchema,
]);

const legacyTimingFields = {
  startTime: timeStringSchema,
  endTime: timeStringSchema.optional(),
  durationMinutes: positiveMinutesSchema.optional(),
};

export const legacyPendingBookingReadSchema = z
  .object({
    candidateId: z.string().min(1),
    date: dateStringSchema,
    ...legacyTimingFields,
    status: z.literal("PENDING_CONFIRMATION"),
    reportedBy: z.string().min(1),
    reportedAt: firestoreTimestampSchema,
  })
  .strict()
  .refine(
    (v) => Boolean(v.endTime || v.durationMinutes),
    "At least one of endTime or durationMinutes is required"
  );

export const legacyConfirmedBookingReadSchema = z
  .object({
    candidateId: z.string().min(1),
    date: dateStringSchema,
    ...legacyTimingFields,
    status: z.literal("CONFIRMED"),
    reportedBy: z.string().min(1),
    reportedAt: firestoreTimestampSchema,
    confirmedBy: z.string().min(1),
    confirmedAt: firestoreTimestampSchema,
  })
  .strict()
  .refine(
    (v) => Boolean(v.endTime || v.durationMinutes),
    "At least one of endTime or durationMinutes is required"
  );

export const legacyFixedBookingReadSchema = z.union([
  legacyPendingBookingReadSchema,
  legacyConfirmedBookingReadSchema,
]);

export type PendingBookingDocument = z.infer<typeof pendingBookingSchema>;
export type ConfirmedBookingDocument = z.infer<typeof confirmedBookingSchema>;
export type FixedBookingDocument = z.infer<typeof fixedBookingDocumentSchema>;

export type LegacyPendingBookingRead = z.infer<typeof legacyPendingBookingReadSchema>;
export type LegacyConfirmedBookingRead = z.infer<typeof legacyConfirmedBookingReadSchema>;
export type LegacyFixedBookingRead = z.infer<typeof legacyFixedBookingReadSchema>;
