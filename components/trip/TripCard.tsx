import Link from "next/link";
import { Check, Users } from "lucide-react";
import type { TripPhase } from "@travel-planner/shared";
import { getPhaseLabel } from "@/lib/navigation/trip-phase";

const phases: TripPhase[] = ["COLLECTING", "VOTING", "PLANNING", "REVIEW", "FINALIZED"];

export type TripCardViewModel = {
  id: string;
  name: string;
  destinationName: string;
  startDate: string;
  endDate: string;
  role: "OWNER" | "MEMBER";
  phase?: TripPhase;
  memberCount?: number;
};

export function TripCard({ trip }: { trip: TripCardViewModel }) {
  const current = trip.phase ? phases.indexOf(trip.phase) : -1;
  return (
    <Link href={`/trips/${trip.id}`} className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-card)]">
      <div className="relative flex h-32 flex-col justify-between bg-[var(--color-ink)] p-4">
        <div className="flex justify-between"><span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white/90">{trip.destinationName}</span><span className="text-xs font-semibold text-white/70">{trip.role === "OWNER" ? "Owner" : "Member"}</span></div>
        <h2 className="break-words font-display text-xl font-bold text-white">{trip.name}</h2>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between text-sm text-[var(--color-ink-soft)]"><span className="font-medium text-[var(--color-ink)]">{trip.startDate} → {trip.endDate}</span><span className="flex items-center gap-1">{trip.memberCount === undefined ? trip.role === "OWNER" ? "Owner" : "Member" : <><Users size={13} /> {trip.memberCount}</>}</span></div>
        <div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Planning progress</p>{trip.phase ? <><div className="flex items-center gap-1">{phases.map((phase, index) => <div key={phase} className="flex flex-1 items-center gap-1"><div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${index < current ? "bg-[var(--color-teal)] text-white" : index === current ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]"}`}>{index < current ? <Check size={10} strokeWidth={3} /> : index + 1}</div>{index < phases.length - 1 && <div className={`h-px flex-1 ${index < current ? "bg-[var(--color-teal)]" : "bg-[var(--color-border)]"}`} />}</div>)}</div><p className="mt-2 text-xs text-[var(--color-ink-soft)]">Currently at <span className="font-semibold text-[var(--color-ink)]">{getPhaseLabel(trip.phase)}</span></p></> : <p className="text-xs text-[var(--color-ink-soft)]">Open the trip to view its live backend phase.</p>}</div>
      </div>
    </Link>
  );
}
