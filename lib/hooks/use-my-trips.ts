"use client";
import { useAuth } from "@/lib/auth/use-auth";
import { subscribeMyMemberships, type MembershipRecord } from "@/lib/repositories/memberships";
import { useRealtime } from "./use-realtime";
export function useMyTrips() {
  const { user } = useAuth();
  return useRealtime<MembershipRecord[]>((onData, onError) => subscribeMyMemberships(user!.uid, onData, onError), [user?.uid], Boolean(user), []);
}
