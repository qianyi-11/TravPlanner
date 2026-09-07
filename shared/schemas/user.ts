import { z } from "zod";
import { firestoreTimestampSchema } from "./common";

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email(),
  photoURL: z.string().url().optional(),
  createdAt: firestoreTimestampSchema,
  updatedAt: firestoreTimestampSchema,
});
export type UserProfile = z.infer<typeof userProfileSchema>;
