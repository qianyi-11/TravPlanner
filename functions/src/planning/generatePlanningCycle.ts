import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  generatePlanningCycleInputSchema,
  generatePlanningCycleResultSchema,
} from "@travel-planner/shared";
import { authError, requireAuth } from "../auth";
import { runAuthoritativePlanning } from "./authoritativePlanning";

export async function generatePlanningCycleHandler(request: CallableRequest<unknown>) {
  const uid = requireAuth(request);
  const parsed = generatePlanningCycleInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw authError("INVALID_INPUT", "Planning-cycle input is invalid.");
  }
  const result = await runAuthoritativePlanning({
    tripId: parsed.data.tripId,
    ownerId: uid,
    expectedPlanningCycle: parsed.data.expectedPlanningCycle,
  });
  return generatePlanningCycleResultSchema.parse(result);
}

export const generatePlanningCycle = onCall(
  { enforceAppCheck: true, timeoutSeconds: 300 },
  generatePlanningCycleHandler,
);
