"use client";

import { CalendarDays, Users, Wallet } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Trip } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { formatCurrency, formatDateRange } from "@/lib/utils";
import { MemberStack } from "@/components/ui/Avatar";
import { ProgressStepper } from "./ProgressStepper";

export function TripHeader({ trip }: { trip: Trip }) {
  const members = usePlannerStore(
    useShallow((s) => trip.memberIds.map((id) => s.members[id]).filter(Boolean))
  );

  return (
    <div className="space-y-5">
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
        style={{ background: trip.coverColor }}
      >
        <p className="text-sm font-medium text-white/70">{trip.destinations.join(" · ")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{trip.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
          <span className="flex items-center gap-1.5">
            <CalendarDays size={15} /> {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={15} /> {trip.groupSize} travelers
          </span>
          <span className="flex items-center gap-1.5">
            <Wallet size={15} /> {formatCurrency(trip.budgetTotal)} budget
          </span>
          <MemberStack members={members} max={5} size="xs" />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)] sm:p-4">
        <ProgressStepper tripId={trip.id} current={trip.stage} />
      </div>
    </div>
  );
}
