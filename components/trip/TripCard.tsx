"use client";

import Link from "next/link";
import { Check, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Trip } from "@/lib/types";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { formatDateRange, stageStatus } from "@/lib/utils";
import { MemberStack } from "@/components/ui/Avatar";

export function TripCard({ trip }: { trip: Trip }) {
  const members = usePlannerStore(
    useShallow((s) => trip.memberIds.map((id) => s.members[id]).filter(Boolean))
  );

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-card)]"
    >
      <div
        className="relative flex h-32 flex-col justify-between p-4"
        style={{ background: trip.coverColor }}
      >
        <div className="flex justify-between">
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {trip.destinations.join(" · ")}
          </span>
        </div>
        <h3 className="font-display text-xl font-bold text-white drop-shadow-sm">{trip.name}</h3>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between text-sm text-[var(--color-ink-soft)]">
          <span className="font-medium text-[var(--color-ink)]">
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="flex items-center gap-1">
            <Users size={13} /> {trip.groupSize} travelers
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <MemberStack members={members} max={4} size="xs" />
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Planning progress
          </p>
          <div className="flex items-center gap-1">
            {STAGE_ORDER.map((stage, i) => {
              const status = stageStatus(stage, trip.stage);
              return (
                <div key={stage} className="flex flex-1 items-center gap-1">
                  <div
                    className={
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold " +
                      (status === "done"
                        ? "bg-[var(--color-teal)] text-white"
                        : status === "current"
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]")
                    }
                  >
                    {status === "done" ? <Check size={10} strokeWidth={3} /> : i + 1}
                  </div>
                  {i < STAGE_ORDER.length - 1 && (
                    <div
                      className={
                        "h-px flex-1 " +
                        (status === "done" ? "bg-[var(--color-teal)]" : "bg-[var(--color-border)]")
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
            Currently at <span className="font-semibold text-[var(--color-ink)]">{STAGE_LABELS[trip.stage]}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
