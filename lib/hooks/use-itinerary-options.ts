"use client";
import { subscribeItineraryOptions, type ItineraryOptionRecord } from "@/lib/repositories/itinerary-options";
import { useRealtime } from "./use-realtime";
export function useItineraryOptions(tripId: string, planningCycle?: number) {
  return useRealtime<ItineraryOptionRecord[]>((onData, onError) => subscribeItineraryOptions(tripId, planningCycle!, onData, onError), [tripId, planningCycle], Boolean(tripId && planningCycle), []);
}
