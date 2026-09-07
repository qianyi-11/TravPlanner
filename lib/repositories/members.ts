import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import type { TripMemberDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type MemberRecord = TripMemberDocument & { id: string };

export function subscribeTripMembers(tripId: string, onData: (members: MemberRecord[]) => void, onError?: (error: Error) => void) {
  const members = collection(getFirebaseFirestore(), "trips", tripId, "members");
  return onSnapshot(query(members, orderBy("joinedAt", "asc")), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as TripMemberDocument) })));
  }, onError);
}
