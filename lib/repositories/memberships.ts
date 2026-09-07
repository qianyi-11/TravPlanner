import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import type { TripMembershipProjection } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type MembershipRecord = TripMembershipProjection & { id: string };

export function subscribeMyMemberships(uid: string, onData: (memberships: MembershipRecord[]) => void, onError?: (error: Error) => void) {
  const memberships = collection(getFirebaseFirestore(), "users", uid, "tripMemberships");
  return onSnapshot(query(memberships, orderBy("updatedAt", "desc")), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as TripMembershipProjection) })));
  }, onError);
}
