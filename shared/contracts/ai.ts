import { z } from "zod";
import { tripIdSchema } from "./common";

export const aiExplanationContextSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ITINERARY_OPTIONS"),
  }),
  z.object({
    type: z.literal("CONFLICT"),
    reasonCodes: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("ITINERARY_VERSION"),
    versionId: z.string().min(1),
  }),
]);

export const generateAIExplanationInputSchema = z.object({
  tripId: tripIdSchema,
  context: aiExplanationContextSchema,
});

export const generateAIExplanationResultSchema = z.object({
  source: z.enum(["AI", "DETERMINISTIC_FALLBACK"]),
  summary: z.string(),
  tradeoffs: z.array(z.string()),
});

export type AIExplanationContext = z.infer<typeof aiExplanationContextSchema>;
export type GenerateAIExplanationInput =
  z.infer<typeof generateAIExplanationInputSchema>;
export type GenerateAIExplanationResult =
  z.infer<typeof generateAIExplanationResultSchema>;
