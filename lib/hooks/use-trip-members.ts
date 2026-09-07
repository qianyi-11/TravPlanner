"use client";
import { subscribeTripMembers, type MemberRecord } from "@/lib/repositories/members";
import { useRealtime } from "./use-realtime";
export function useTripMembers(tripId: string) {
  return useRealtime<MemberRecord[]>((onData, onError) => subscribeTripMembers(tripId, onData, onError), [tripId], Boolean(tripId), []);
}
