import { z } from "zod";
import { ITINERARY_VARIANTS } from "../enums";
import {
  dateStringSchema,
  firestoreTimestampSchema,
  locationRefSchema,
  positiveMinutesSchema,
  timeStringSchema,
} from "./common";

export const itineraryItemSchema = z.object({
  itemId: z.string().min(1),
  candidateId: z.string().min(1).optional(),
  title: z.string().min(1),
  date: dateStringSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  durationMinutes: positiveMinutesSchema,
  location: locationRefSchema.optional(),
}).strict();

export const itineraryDaySchema = z.object({
  date: dateStringSchema,
  items: z.array(itineraryItemSchema),
}).strict();

export const itineraryOptionScoreSchema = z.object({
  mustDo: z.number().int().nonnegative(),
  votePreference: z.number().finite(),
  travelEfficiency: z.number().finite(),
  gapEfficiency: z.number().finite(),
  budgetEfficiency: z.number().finite(),
  preferredPeriod: z.number().finite(),
}).strict();

export const itineraryOptionDocumentSchema = z.object({
  planningCycle: z.number().int().positive(),
  variant: z.enum(ITINERARY_VARIANTS),
  days: z.array(itineraryDaySchema),
  score: itineraryOptionScoreSchema,
  validationSnapshotId: z.string().min(1),
  createdAt: firestoreTimestampSchema,
}).strict();

export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type ItineraryOptionScore = z.infer<typeof itineraryOptionScoreSchema>;
export type ItineraryOptionDocument = z.infer<typeof itineraryOptionDocumentSchema>;
