"use client";

import { subscribeApprovals, type ApprovalRecord } from "@/lib/repositories/approvals";
import { useRealtime } from "./use-realtime";

export function useApprovals(tripId: string) {
  return useRealtime<ApprovalRecord[]>((onData, onError) => subscribeApprovals(tripId, onData, onError), [tripId], Boolean(tripId));
}
