"use client";
import { useAuth } from "@/lib/auth/use-auth";
import { subscribeOwnCandidateVote } from "@/lib/repositories/votes";
import type { LegacyCandidateVoteDocument } from "@travel-planner/shared";
import { useRealtime } from "./use-realtime";
export function useOwnCandidateVote(tripId: string, planningCycle: number, candidateId: string) {
  const { user } = useAuth();
  return useRealtime<LegacyCandidateVoteDocument | null>((onData, onError) => subscribeOwnCandidateVote(tripId, planningCycle, candidateId, user!.uid, onData, onError), [tripId, planningCycle, candidateId, user?.uid], Boolean(user && tripId && planningCycle && candidateId));
}
