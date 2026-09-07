"use client";
import { subscribeTrip, type TripRecord } from "@/lib/repositories/trips";
import { useRealtime } from "./use-realtime";
export function useTrip(tripId: string) {
  return useRealtime<TripRecord | null>((onData, onError) => subscribeTrip(tripId, onData, onError), [tripId], Boolean(tripId));
}
