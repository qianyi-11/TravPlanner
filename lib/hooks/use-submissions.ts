"use client";
import { subscribeSubmissions, type SubmissionRecord } from "@/lib/repositories/submissions";
import { useRealtime } from "./use-realtime";
export function useSubmissions(tripId: string) {
  return useRealtime<SubmissionRecord[]>((onData, onError) => subscribeSubmissions(tripId, onData, onError), [tripId], Boolean(tripId), []);
}
