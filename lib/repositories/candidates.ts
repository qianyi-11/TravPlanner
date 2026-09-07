import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { CandidateDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type CandidateRecord = CandidateDocument & { id: string };

export function subscribeCandidates(tripId: string, onData: (candidates: CandidateRecord[]) => void, onError?: (error: Error) => void) {
  const candidates = collection(getFirebaseFirestore(), "trips", tripId, "candidates");
  return onSnapshot(query(candidates, where("active", "==", true)), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as CandidateDocument) })));
  }, onError);
}
