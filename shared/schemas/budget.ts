import { z } from "zod";
import { supportedCurrencyCodeSchema, validateMonetaryPrecision } from "../constants";
import { firestoreTimestampSchema } from "./common";

export const activityBudgetWriteSchema = z
  .object({
    memberId: z.string().min(1),
    amount: z.number().finite().positive(),
    currency: supportedCurrencyCodeSchema,
    planningCycleUpdated: z.number().int().positive(),
    updatedAt: firestoreTimestampSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!validateMonetaryPrecision(data.amount, data.currency)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Amount ${data.amount} exceeds allowed decimal places for ${data.currency}`,
        path: ["amount"],
      });
    }
  });

export const activityBudgetReadSchema = z
  .object({
    memberId: z.string().min(1),
    amount: z.number().finite().positive(),
    currency: z.string().min(1),
    planningCycleUpdated: z.number().int().positive(),
    updatedAt: firestoreTimestampSchema,
  })
  .strict();

export type ActivityBudgetWrite = z.infer<typeof activityBudgetWriteSchema>;
export type ActivityBudgetRead = z.infer<typeof activityBudgetReadSchema>;
