import { doc, onSnapshot } from "firebase/firestore";
import type { ReviewDraftDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export function subscribeReviewDraft(tripId: string, planningCycle: number, onData: (draft: ReviewDraftDocument | null) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "trips", tripId, "reviewDrafts", String(planningCycle)), (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() as ReviewDraftDocument : null);
  }, onError);
}
