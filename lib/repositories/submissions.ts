import { collection, onSnapshot, query } from "firebase/firestore";
import type { SubmissionDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type SubmissionRecord = SubmissionDocument & { id: string };

export function subscribeSubmissions(tripId: string, onData: (submissions: SubmissionRecord[]) => void, onError?: (error: Error) => void) {
  const submissions = collection(getFirebaseFirestore(), "trips", tripId, "submissions");
  return onSnapshot(query(submissions), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as SubmissionDocument) })));
  }, onError);
}
