import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { leaveTripInputSchema, leaveTripResultSchema } from "@travel-planner/shared";
import { authError, requireAuth } from "../auth";
import { applyMembershipRemoval } from "./applyMembershipRemoval";

export async function leaveTripHandler(request: CallableRequest<unknown>) {
  const actorUid = requireAuth(request);
  const parsed = leaveTripInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Leave-trip input is invalid.");

  const result = await applyMembershipRemoval({
    ...parsed.data,
    actorUid,
    targetUid: actorUid,
    removalKind: "SELF_LEAVE",
  });
  return leaveTripResultSchema.parse(result);
}

export const leaveTrip = onCall({ enforceAppCheck: true }, leaveTripHandler);
