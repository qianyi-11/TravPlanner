"use client";
import { useAuth } from "@/lib/auth/use-auth";
import { subscribeOwnOptionVote } from "@/lib/repositories/votes";
import type { OptionVoteDocument } from "@travel-planner/shared";
import { useRealtime } from "./use-realtime";
export function useOwnOptionVote(tripId: string) {
  const { user } = useAuth();
  return useRealtime<OptionVoteDocument | null>((onData, onError) => subscribeOwnOptionVote(tripId, user!.uid, onData, onError), [tripId, user?.uid], Boolean(user && tripId));
}
