import { doc, onSnapshot } from "firebase/firestore";
import type { TripDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type TripRecord = TripDocument & { id: string };

export function subscribeTrip(tripId: string, onData: (trip: TripRecord | null) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "trips", tripId), (snapshot) => {
    onData(snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as TripDocument) } : null);
  }, onError);
}
