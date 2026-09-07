import { authError } from "./errors";
import type { TripAuthContext } from "./types";

export function requireMembershipVersion(
  context: TripAuthContext,
  expectedMembershipVersion: number,
): void {
  if (context.trip.membershipVersion !== expectedMembershipVersion) {
    throw authError(
      "STALE_MEMBERSHIP_VERSION",
      "Trip membership has changed.",
      {
        tripId: context.tripId,
        expectedMembershipVersion,
        currentMembershipVersion: context.trip.membershipVersion,
      },
    );
  }
}
