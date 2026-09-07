import { z } from "zod";
import {
  CHANGE_REQUEST_STATUSES,
  TRANSPORT_MODES,
} from "../enums";
import {
  baseLocationSchema,
  dateStringSchema,
  dayOverrideSchema,
  dayWindowSchema,
  firestoreTimestampSchema,
  positiveMinutesSchema,
  timeStringSchema,
} from "./common";

export const CHANGE_REQUEST_OPERATIONS = [
  "MOVE_ACTIVITY",
  "CHANGE_TIME",
  "CHANGE_DURATION",
  "ADD_ACTIVITY",
  "REMOVE_ACTIVITY",
  "REPLACE_ACTIVITY",
  "CHANGE_FIXED_BOOKING",
  "CHANGE_DESTINATION",
  "CHANGE_TRIP_DATES",
  "CHANGE_BASE_LOCATION",
  "CHANGE_DAY_WINDOW",
  "CHANGE_TRANSPORT",
  "CHANGE_BUDGET",
] as const;

export const changeRequestChangeSchema = z.union([
  z.object({
    operation: z.literal("MOVE_ACTIVITY"),
    itemId: z.string().min(1),
    targetDate: dateStringSchema,
    targetStartTime: timeStringSchema,
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_TIME"),
    itemId: z.string().min(1),
    targetStartTime: timeStringSchema,
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_DURATION"),
    itemId: z.string().min(1),
    durationMinutes: positiveMinutesSchema,
  }).strict(),
  z.object({
    operation: z.literal("ADD_ACTIVITY"),
    candidateId: z.string().min(1),
    targetDate: dateStringSchema.optional(),
  }).strict(),
  z.object({
    operation: z.literal("REMOVE_ACTIVITY"),
    itemId: z.string().min(1),
  }).strict(),
  z.object({
    operation: z.literal("REPLACE_ACTIVITY"),
    itemId: z.string().min(1),
    replacementCandidateId: z.string().min(1),
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_FIXED_BOOKING"),
    action: z.literal("UPDATE"),
    bookingId: z.string().min(1),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema.optional(),
    durationMinutes: positiveMinutesSchema.optional(),
  }).strict().refine(
    value => value.endTime !== undefined || value.durationMinutes !== undefined,
    "Either endTime or durationMinutes is required",
  ),
  z.object({
    operation: z.literal("CHANGE_FIXED_BOOKING"),
    action: z.literal("CANCEL"),
    bookingId: z.string().min(1),
    cancel: z.literal(true),
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_DESTINATION"),
    destinationPlaceId: z.string().min(1),
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_TRIP_DATES"),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_BASE_LOCATION"),
    baseLocation: baseLocationSchema,
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_DAY_WINDOW"),
    defaultDayWindow: dayWindowSchema,
    dayOverrides: z.array(dayOverrideSchema).optional(),
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_TRANSPORT"),
    primaryTransport: z.enum(TRANSPORT_MODES),
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_BUDGET"),
    amount: z.number().finite().positive(),
  }).strict(),
  z.object({
    operation: z.literal("CHANGE_BUDGET"),
    clear: z.literal(true),
  }).strict(),
]);

export type ChangeRequestChange = z.infer<typeof changeRequestChangeSchema>;

export function splitChangeRequestChange(change: ChangeRequestChange): {
  operation: ChangeRequestChange["operation"];
  payload: Record<string, unknown>;
} {
  const { operation, ...payload } = change;
  return { operation, payload };
}

export function mergeChangeRequestChange(input: {
  operation: ChangeRequestChange["operation"];
  payload: Record<string, unknown>;
}): ChangeRequestChange {
  return changeRequestChangeSchema.parse({ operation: input.operation, ...input.payload });
}

export const changeRequestDocumentSchema = z.object({
  baseItineraryVersionId: z.string().min(1),
  requestedBy: z.string().min(1),
  classification: z.enum(["MINOR", "STRUCTURAL"]),
  operation: z.enum(CHANGE_REQUEST_OPERATIONS),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(CHANGE_REQUEST_STATUSES),
  approvalId: z.string().min(1).optional(),
  validationSnapshotId: z.string().min(1).optional(),
  resultingVersionId: z.string().min(1).optional(),
  createdAt: firestoreTimestampSchema,
  updatedAt: firestoreTimestampSchema,
}).strict().superRefine((value, ctx) => {
  const parsed = changeRequestChangeSchema.safeParse({
    operation: value.operation,
    ...value.payload,
  });
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload"],
      message: "Change Request payload does not match its operation",
    });
  }

  if (value.status === "APPLIED" && value.resultingVersionId === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resultingVersionId"],
      message: "APPLIED Change Requests require resultingVersionId",
    });
  }
});

export type ChangeRequestDocument = z.infer<typeof changeRequestDocumentSchema>;
