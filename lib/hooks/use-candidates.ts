"use client";
import { subscribeCandidates, type CandidateRecord } from "@/lib/repositories/candidates";
import { useRealtime } from "./use-realtime";
export function useCandidates(tripId: string) {
  return useRealtime<CandidateRecord[]>((onData, onError) => subscribeCandidates(tripId, onData, onError), [tripId], Boolean(tripId), []);
}
