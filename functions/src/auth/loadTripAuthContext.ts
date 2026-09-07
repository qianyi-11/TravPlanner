import {
  getFirestore,
  type Transaction,
} from "firebase-admin/firestore";
import type {
  TripDocument,
  TripMemberDocument,
} from "@travel-planner/shared";
import { authError } from "./errors";
import type { TripAuthContext } from "./types";

function refs(tripId: string, uid: string) {
  const db = getFirestore();
  const tripRef = db.collection("trips").doc(tripId);
  const memberRef = tripRef.collection("members").doc(uid);
  return { tripRef, memberRef };
}

function buildContext(
  tripId: string,
  uid: string,
  tripData: TripDocument,
  memberData: TripMemberDocument | null,
): TripAuthContext {
  return {
    uid,
    tripId,
    trip: tripData,
    member: memberData,
  };
}

export async function loadTripAuthContext(
  tripId: string,
  uid: string,
): Promise<TripAuthContext> {
  const { tripRef, memberRef } = refs(tripId, uid);

  const [tripSnap, memberSnap] = await Promise.all([
    tripRef.get(),
    memberRef.get(),
  ]);

  if (!tripSnap.exists) {
    throw authError("NOT_FOUND", "Trip was not found.", { tripId });
  }

  return buildContext(
    tripId,
    uid,
    tripSnap.data() as TripDocument,
    memberSnap.exists ? (memberSnap.data() as TripMemberDocument) : null,
  );
}

/**
 * Use this form for race-sensitive authoritative mutations. The function
 * re-reads trip + membership in the same Firestore transaction that will
 * commit the protected state change.
 */
export async function loadTripAuthContextInTransaction(
  transaction: Transaction,
  tripId: string,
  uid: string,
): Promise<TripAuthContext> {
  const { tripRef, memberRef } = refs(tripId, uid);

  const [tripSnap, memberSnap] = await Promise.all([
    transaction.get(tripRef),
    transaction.get(memberRef),
  ]);

  if (!tripSnap.exists) {
    throw authError("NOT_FOUND", "Trip was not found.", { tripId });
  }

  return buildContext(
    tripId,
    uid,
    tripSnap.data() as TripDocument,
    memberSnap.exists ? (memberSnap.data() as TripMemberDocument) : null,
  );
}
