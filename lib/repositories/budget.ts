import { doc, onSnapshot } from "firebase/firestore";
import type { ActivityBudgetRead } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export function subscribeActivityBudget(tripId: string, uid: string, onData: (budget: ActivityBudgetRead | null) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "trips", tripId, "activityBudgets", uid), (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() as ActivityBudgetRead : null);
  }, onError);
}
