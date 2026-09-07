import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import type { ItineraryVersionDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export type ItineraryVersionRecord = ItineraryVersionDocument & { id: string };

export function subscribeFinalItinerary(tripId: string, onData: (version: ItineraryVersionRecord | null) => void, onError?: (error: Error) => void) {
  const versions = collection(getFirebaseFirestore(), "trips", tripId, "itineraryVersions");
  return onSnapshot(query(versions, orderBy("versionNumber", "desc"), limit(1)), (snapshot) => {
    const item = snapshot.docs[0];
    onData(item ? { id: item.id, ...(item.data() as ItineraryVersionDocument) } : null);
  }, onError);
}
