import { CalendarDays, Users } from "lucide-react";
import type { TripPhase } from "@travel-planner/shared";
import { Card } from "@/components/ui/Card";
import { ProgressStepper } from "./ProgressStepper";

export function TripHeader({ trip, memberCount, role }: { trip: { id: string; name: string; destination: { name: string }; startDate: string; endDate: string; phase: TripPhase }; memberCount: number; role?: "OWNER" | "MEMBER" }) {
  return <div className="space-y-5"><div className="relative overflow-hidden rounded-3xl bg-[var(--color-ink)] p-6 sm:p-8"><p className="text-sm font-medium text-white/70">{trip.destination.name}</p><h1 className="mt-1 break-words font-display text-2xl font-bold text-white sm:text-3xl">{trip.name}</h1><div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85"><span className="flex items-center gap-1.5"><CalendarDays size={15} /> {trip.startDate} → {trip.endDate}</span><span className="flex items-center gap-1.5"><Users size={15} /> {memberCount} member{memberCount === 1 ? "" : "s"}</span>{role && <span>Your role: {role}</span>}</div></div><Card className="p-3 sm:p-4"><ProgressStepper tripId={trip.id} current={trip.phase} /></Card></div>;
}
