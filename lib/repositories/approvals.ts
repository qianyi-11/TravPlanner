import { collection, onSnapshot } from "firebase/firestore";
import type { ApprovalDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type ApprovalRecord = ApprovalDocument & { id: string };

export function subscribeApprovals(
  tripId: string,
  onData: (approvals: ApprovalRecord[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(collection(getFirebaseFirestore(), "trips", tripId, "approvals"), snapshot => {
    onData(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as ApprovalDocument) })));
  }, onError);
}
