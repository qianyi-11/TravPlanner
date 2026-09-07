"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { TripPhase } from "@travel-planner/shared";
import { cx } from "@/lib/utils";
import { getPhaseLabel } from "@/lib/navigation/trip-phase";

const phases: TripPhase[] = ["COLLECTING", "VOTING", "PLANNING", "REVIEW", "FINALIZED"];
const routes: Record<TripPhase, string> = { COLLECTING: "places", VOTING: "vote", PLANNING: "generating", REVIEW: "itinerary", FINALIZED: "plan" };

export function ProgressStepper({ tripId, current, linkable = true }: { tripId: string; current: TripPhase; linkable?: boolean }) {
  const currentIndex = phases.indexOf(current);
  return <div className="flex items-center gap-0 overflow-x-auto scrollbar-none -mx-1 px-1">{phases.map((phase, index) => { const status = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming"; const content = <div className={cx("group flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 transition-colors", status === "current" && "bg-[var(--color-ink)]", status !== "current" && linkable && "hover:bg-[var(--color-sand)]")}><span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold font-display", status === "done" && "bg-[var(--color-teal)] text-white", status === "current" && "bg-white text-[var(--color-ink)]", status === "upcoming" && "bg-[var(--color-sand)] text-[var(--color-ink-soft)]")}>{status === "done" ? <Check size={13} strokeWidth={3} /> : String(index + 1).padStart(2, "0")}</span><span className={cx("whitespace-nowrap text-sm font-semibold", status === "current" && "text-white", status === "done" && "text-[var(--color-ink)]", status === "upcoming" && "text-[var(--color-ink-soft)]")}>{getPhaseLabel(phase)}</span></div>; return <div key={phase} className="flex shrink-0 items-center">{linkable ? <Link href={`/trips/${tripId}/${routes[phase]}`}>{content}</Link> : content}{index < phases.length - 1 && <div className={cx("mx-1 h-px w-4 shrink-0 sm:w-6", status === "done" ? "bg-[var(--color-teal)]" : "bg-[var(--color-border)]")} />}</div>; })}</div>;
}
