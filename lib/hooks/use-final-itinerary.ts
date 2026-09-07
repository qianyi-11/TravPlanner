"use client";
import { subscribeFinalItinerary, type ItineraryVersionRecord } from "@/lib/repositories/itinerary-versions";
import { useRealtime } from "./use-realtime";
export function useFinalItinerary(tripId: string) {
  return useRealtime<ItineraryVersionRecord | null>((onData, onError) => subscribeFinalItinerary(tripId, onData, onError), [tripId], Boolean(tripId));
}
