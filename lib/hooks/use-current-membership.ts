"use client";
import { useAuth } from "@/lib/auth/use-auth";
import { useTripMembers } from "./use-trip-members";
export function useCurrentMembership(tripId: string) {
  const { user } = useAuth();
  const members = useTripMembers(tripId);
  return { ...members, data: members.data?.find((member) => member.id === user?.uid) ?? null };
}
