import { authError } from "./errors";
import { requireActiveMember } from "./requireActiveMember";
import type { TripAuthContext } from "./types";

export function requireOwner(context: TripAuthContext): void {
  requireActiveMember(context);

  if (
    context.member.role !== "OWNER" ||
    context.trip.ownerId !== context.uid
  ) {
    throw authError("OWNER_REQUIRED", "OWNER authorization is required.", {
      tripId: context.tripId,
    });
  }
}
