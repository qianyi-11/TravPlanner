"use client";
import { subscribeReviewDraft } from "@/lib/repositories/review";
import type { ReviewDraftDocument } from "@travel-planner/shared";
import { useRealtime } from "./use-realtime";
export function useReview(tripId: string, planningCycle?: number) {
  return useRealtime<ReviewDraftDocument | null>((onData, onError) => subscribeReviewDraft(tripId, planningCycle!, onData, onError), [tripId, planningCycle], Boolean(tripId && planningCycle));
}
