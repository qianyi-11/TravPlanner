import { authError } from "./errors";
import type { TripAuthContext } from "./types";

export function requireActiveMember(
  context: TripAuthContext,
): asserts context is TripAuthContext & {
  member: NonNullable<TripAuthContext["member"]>;
} {
  if (!context.member) {
    throw authError("NOT_MEMBER", "Caller is not a trip member.", {
      tripId: context.tripId,
    });
  }

  if (context.member.status !== "ACTIVE") {
    throw authError("MEMBER_INACTIVE", "Trip membership is not active.", {
      tripId: context.tripId,
    });
  }
}
