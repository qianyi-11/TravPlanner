"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { STAGE_LABELS, STAGE_ORDER, type PlanningStage } from "@/lib/types";
import { cx, stageStatus } from "@/lib/utils";

const STAGE_HREF: Record<PlanningStage, string> = {
  ideas: "places",
  preferences: "preferences",
  voting: "vote",
  validation: "validate",
  route: "route",
  itinerary: "itinerary",
};

export function ProgressStepper({
  tripId,
  current,
  linkable = true,
}: {
  tripId: string;
  current: PlanningStage;
  linkable?: boolean;
}) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto scrollbar-none -mx-1 px-1">
      {STAGE_ORDER.map((stage, i) => {
        const status = stageStatus(stage, current);
        const isLast = i === STAGE_ORDER.length - 1;
        const content = (
          <div
            className={cx(
              "group flex items-center gap-2.5 rounded-full px-3.5 py-2 transition-colors shrink-0",
              status === "current" && "bg-[var(--color-ink)]",
              status !== "current" && linkable && "hover:bg-[var(--color-sand)]"
            )}
          >
            <span
              className={cx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold font-display",
                status === "done" && "bg-[var(--color-teal)] text-white",
                status === "current" && "bg-white text-[var(--color-ink)]",
                status === "upcoming" && "bg-[var(--color-sand)] text-[var(--color-ink-soft)]"
              )}
            >
              {status === "done" ? <Check size={13} strokeWidth={3} /> : String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={cx(
                "text-sm font-semibold whitespace-nowrap",
                status === "current" && "text-white",
                status === "done" && "text-[var(--color-ink)]",
                status === "upcoming" && "text-[var(--color-ink-soft)]"
              )}
            >
              {STAGE_LABELS[stage]}
            </span>
          </div>
        );
        return (
          <div key={stage} className="flex items-center shrink-0">
            {linkable ? (
              <Link href={`/trips/${tripId}/${STAGE_HREF[stage]}`}>{content}</Link>
            ) : (
              content
            )}
            {!isLast && (
              <div
                className={cx(
                  "mx-1 h-px w-4 sm:w-6 shrink-0",
                  status === "done" ? "bg-[var(--color-teal)]" : "bg-[var(--color-border)]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
