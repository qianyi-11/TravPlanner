import { z } from "zod";
import { firestoreTimestampSchema } from "./common";
import { itineraryDaySchema } from "./itinerary";

export const reviewDraftDocumentSchema = z.object({
  planningCycle: z.number().int().positive(),

  sourceOptionId: z.string().min(1),

  revision: z.number().int().positive(),

  days: z.array(itineraryDaySchema),

  validationSnapshotId: z.string().min(1),

  createdAt: firestoreTimestampSchema,
  updatedAt: firestoreTimestampSchema,
  updatedBy: z.string().min(1),
});

export type ReviewDraftDocument = z.infer<typeof reviewDraftDocumentSchema>;
