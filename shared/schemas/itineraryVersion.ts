import { z } from "zod";
import { firestoreTimestampSchema } from "./common";
import { itineraryDaySchema } from "./itinerary";

export const itineraryVersionDocumentSchema = z.object({
  versionNumber: z.number().int().positive(),
  baseVersionId: z.string().min(1).optional(),
  source: z.enum(["FINALIZATION", "CHANGE_REQUEST", "BACKUP_REPLACEMENT"]),
  days: z.array(itineraryDaySchema),
  validationSnapshotId: z.string().min(1),
  sourceReviewDraftRevision: z.number().int().positive().optional(),
  appliedChangeRequestId: z.string().min(1).optional(),
  appliedBackupId: z.string().min(1).optional(),
  createdBy: z.string().min(1),
  createdAt: firestoreTimestampSchema,
}).strict();

export type ItineraryVersionDocument = z.infer<typeof itineraryVersionDocumentSchema>;
