import { z } from "zod";
import { TRANSPORT_MODES } from "../enums";
import {
  dateStringSchema,
  firestoreTimestampSchema,
} from "./common";
import { persistedCriticalFactSchema } from "./criticalFactProposal";

const normalizedCoordinateSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

export const normalizedVisitWindowSchema = z.object({
  date: dateStringSchema,
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).strict().refine(value => value.startMinute < value.endMinute, {
  message: "Visit window must start before it ends",
  path: ["endMinute"],
});

export const normalizedPlaceDetailsDataSchema = z.object({
  placeId: z.string().min(1),
  location: normalizedCoordinateSchema,
  placeTypes: z.array(z.string().min(1)),
  visitWindows: z.array(normalizedVisitWindowSchema),
}).strict();

export const normalizedRouteDepartureBucketSchema = z.object({
  date: dateStringSchema,
  startMinute: z.number().int().min(0).max(1439),
}).strict().refine(value => value.startMinute % 15 === 0, {
  message: "Route departure bucket must start on a 15-minute boundary",
  path: ["startMinute"],
});

export const normalizedRouteDataSchema = z.object({
  origin: normalizedCoordinateSchema,
  destination: normalizedCoordinateSchema,
  transportMode: z.enum(TRANSPORT_MODES),
  departureBucket: normalizedRouteDepartureBucketSchema,
  durationMinutes: z.number().int().nonnegative(),
}).strict();

const externalSnapshotBaseShape = {
  cacheKey: z.string().min(1),
  source: z.string().min(1),
  fetchedAt: firestoreTimestampSchema,
};

const externalSnapshotUnion = z.discriminatedUnion("kind", [
  z.object({
    ...externalSnapshotBaseShape,
    provider: z.literal("GOOGLE_PLACES"),
    kind: z.literal("PLACE_DETAILS"),
    freshness: z.enum(["FRESH", "STALE", "UNAVAILABLE"]),
    data: normalizedPlaceDetailsDataSchema.optional(),
  }).strict(),
  z.object({
    ...externalSnapshotBaseShape,
    provider: z.literal("GOOGLE_ROUTES"),
    kind: z.literal("ROUTE"),
    freshness: z.enum(["FRESH", "STALE", "UNAVAILABLE"]),
    data: normalizedRouteDataSchema.optional(),
  }).strict(),
  z.object({
    ...externalSnapshotBaseShape,
    provider: z.literal("USER_CONFIRMED"),
    kind: z.literal("CRITICAL_FACT"),
    source: z.literal("USER_CONFIRMED"),
    freshness: z.enum(["FRESH", "STALE"]),
    submittedBy: z.string().min(1),
    confirmedBy: z.string().min(1),
    confirmedAt: firestoreTimestampSchema,
    data: persistedCriticalFactSchema,
  }).strict(),
]);

export const externalSnapshotSchema = externalSnapshotUnion.superRefine((value, ctx) => {
  if (value.kind === "CRITICAL_FACT") return;

  if (value.freshness === "UNAVAILABLE" && value.data !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "UNAVAILABLE provider snapshots must not carry normalized data",
    });
  }

  if (value.freshness !== "UNAVAILABLE" && value.data === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "FRESH and STALE provider snapshots require normalized data",
    });
  }
});

export type NormalizedVisitWindow = z.infer<typeof normalizedVisitWindowSchema>;
export type NormalizedPlaceDetailsData = z.infer<typeof normalizedPlaceDetailsDataSchema>;
export type NormalizedRouteDepartureBucket = z.infer<typeof normalizedRouteDepartureBucketSchema>;
export type NormalizedRouteData = z.infer<typeof normalizedRouteDataSchema>;
export type ExternalSnapshot = z.infer<typeof externalSnapshotSchema>;
