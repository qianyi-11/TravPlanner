"use client";
import { useAuth } from "@/lib/auth/use-auth";
import { subscribeActivityBudget } from "@/lib/repositories/budget";
import type { ActivityBudgetRead } from "@travel-planner/shared";
import { useRealtime } from "./use-realtime";
export function useActivityBudget(tripId: string) {
  const { user } = useAuth();
  return useRealtime<ActivityBudgetRead | null>((onData, onError) => subscribeActivityBudget(tripId, user!.uid, onData, onError), [tripId, user?.uid], Boolean(tripId && user));
}
