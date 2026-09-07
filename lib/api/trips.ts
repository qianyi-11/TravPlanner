import { createTripInputSchema, createTripResultSchema, reopenTripPhaseInputSchema, reopenTripPhaseResultSchema, type CreateTripInput, type CreateTripResult, type ReopenTripPhaseInput, type ReopenTripPhaseResult } from "@travel-planner/shared";
import { callBackend } from "./callable";
export const createTrip = (input: CreateTripInput): Promise<CreateTripResult> => callBackend("createTrip", input, createTripInputSchema, createTripResultSchema);
export const reopenTripPhase = (input: ReopenTripPhaseInput): Promise<ReopenTripPhaseResult> => callBackend("reopenTripPhase", input, reopenTripPhaseInputSchema, reopenTripPhaseResultSchema);
