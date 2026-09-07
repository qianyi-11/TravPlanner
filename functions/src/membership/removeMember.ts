import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { removeMemberInputSchema, removeMemberResultSchema } from "@travel-planner/shared";
import { authError, requireAuth } from "../auth";
import { applyMembershipRemoval } from "./applyMembershipRemoval";

export async function removeMemberHandler(request: CallableRequest<unknown>) {
  const actorUid = requireAuth(request);
  const parsed = removeMemberInputSchema.safeParse(request.data);
  if (!parsed.success) throw authError("INVALID_INPUT", "Remove-member input is invalid.");

  const result = await applyMembershipRemoval({
    ...parsed.data,
    actorUid,
    targetUid: parsed.data.memberId,
    removalKind: "OWNER_REMOVAL",
  });
  return removeMemberResultSchema.parse(result);
}

export const removeMember = onCall({ enforceAppCheck: true }, removeMemberHandler);
