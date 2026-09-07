import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { ItineraryOptionDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type ItineraryOptionRecord = ItineraryOptionDocument & { id: string };

export function subscribeItineraryOptions(tripId: string, planningCycle: number, onData: (options: ItineraryOptionRecord[]) => void, onError?: (error: Error) => void) {
  const options = collection(getFirebaseFirestore(), "trips", tripId, "itineraryOptions");
  return onSnapshot(query(options, where("planningCycle", "==", planningCycle)), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as ItineraryOptionDocument) })));
  }, onError);
}
