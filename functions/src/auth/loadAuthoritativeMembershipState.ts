import { getFirestore, type Transaction } from "firebase-admin/firestore";
import type { TripMemberDocument } from "@travel-planner/shared";

export interface AuthoritativeMembershipState {
  activeMemberCount: number;
  activeMemberIds: string[];
  isSolo: boolean;
  activeOwnerId: string | null;
}

export function deriveAuthoritativeMembershipState(
  activeMembers: readonly Pick<TripMemberDocument, "uid" | "role">[],
): AuthoritativeMembershipState {
  const activeOwnerIds = activeMembers
    .filter(member => member.role === "OWNER")
    .map(member => member.uid);

  return {
    activeMemberCount: activeMembers.length,
    activeMemberIds: activeMembers.map(member => member.uid),
    activeOwnerId: activeOwnerIds.length === 1 ? activeOwnerIds[0] : null,
    isSolo:
      activeMembers.length === 1 &&
      activeOwnerIds.length === 1 &&
      activeMembers[0].uid === activeOwnerIds[0],
  };
}

/** Reads authoritative ACTIVE memberships within the committing transaction. */
export async function loadAuthoritativeMembershipState(
  transaction: Transaction,
  tripId: string,
): Promise<AuthoritativeMembershipState> {
  const members = await transaction.get(
    getFirestore()
      .collection("trips")
      .doc(tripId)
      .collection("members")
      .where("status", "==", "ACTIVE"),
  );

  return deriveAuthoritativeMembershipState(
    members.docs.map(snapshot => snapshot.data() as TripMemberDocument),
  );
}
