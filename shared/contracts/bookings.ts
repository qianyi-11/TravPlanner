import { z } from "zod";
import {
  dateStringSchema,
  positiveMinutesSchema,
  timeStringSchema,
} from "../schemas";
import {
  bookingIdSchema,
  candidateIdSchema,
  expectedPlanningCycleSchema,
  tripIdSchema,
} from "./common";

const bookingTimingShape = {
  date: dateStringSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema.optional(),
  durationMinutes: positiveMinutesSchema.optional(),
};

const hasBookingEndOrDuration = (value: {
  endTime?: string;
  durationMinutes?: number;
}) => Boolean(value.endTime || value.durationMinutes);

export const bookingTimingInputSchema = z.object(bookingTimingShape).strict().refine(
  hasBookingEndOrDuration,
  {
    message: "Either endTime or durationMinutes is required",
  },
);

export const reportFixedBookingInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  candidateId: candidateIdSchema,
  ...bookingTimingShape,
}).strict().refine(hasBookingEndOrDuration, {
  message: "Either endTime or durationMinutes is required",
});

export const reportFixedBookingResultSchema = z.object({
  bookingId: bookingIdSchema,
  status: z.enum(["PENDING_CONFIRMATION", "CONFIRMED"]),
  phase: z.enum(["COLLECTING", "VOTING"]),
  planningCycle: z.number().int().positive(),
}).strict();

export const confirmFixedBookingInputSchema = z.object({
  tripId: tripIdSchema,
  expectedPlanningCycle: expectedPlanningCycleSchema,
  bookingId: bookingIdSchema,
}).strict();

export const confirmFixedBookingResultSchema = z.object({
  bookingId: bookingIdSchema,
  status: z.literal("CONFIRMED"),
  changed: z.boolean(),
  phase: z.enum(["COLLECTING", "VOTING"]),
  planningCycle: z.number().int().positive(),
}).strict();

export const changeFixedBookingInputSchema = z.union([
  z.object({
    tripId: tripIdSchema,
    expectedPlanningCycle: expectedPlanningCycleSchema,
    bookingId: bookingIdSchema,
    action: z.literal("UPDATE"),
    ...bookingTimingShape,
  }).strict().refine(hasBookingEndOrDuration, {
    message: "Either endTime or durationMinutes is required",
  }),
  z.object({
    tripId: tripIdSchema,
    expectedPlanningCycle: expectedPlanningCycleSchema,
    bookingId: bookingIdSchema,
    action: z.literal("CANCEL"),
    cancel: z.literal(true),
  }).strict(),
]);

export const changeFixedBookingResultSchema = z.object({
  bookingId: bookingIdSchema,
  action: z.enum(["UPDATE", "CANCEL"]),
  changed: z.boolean(),
  phase: z.enum(["COLLECTING", "VOTING"]),
  planningCycle: z.number().int().positive(),
}).strict();

export type ReportFixedBookingInput =
  z.infer<typeof reportFixedBookingInputSchema>;
export type ReportFixedBookingResult =
  z.infer<typeof reportFixedBookingResultSchema>;
export type ConfirmFixedBookingInput =
  z.infer<typeof confirmFixedBookingInputSchema>;
export type ConfirmFixedBookingResult =
  z.infer<typeof confirmFixedBookingResultSchema>;
export type BookingTimingInput = z.infer<typeof bookingTimingInputSchema>;
export type ChangeFixedBookingInput =
  z.infer<typeof changeFixedBookingInputSchema>;
export type ChangeFixedBookingResult =
  z.infer<typeof changeFixedBookingResultSchema>;
