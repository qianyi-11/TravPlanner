"use client";

import { ArrowLeft, CalendarDays, Receipt, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import type { Trip } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { cx, formatCurrency, formatDateRange } from "@/lib/utils";
import { MemberStack } from "@/components/ui/Avatar";
import { ProgressStepper } from "./ProgressStepper";

export function TripHeader({ trip }: { trip: Trip }) {
  const members = usePlannerStore(
    useShallow((s) => trip.memberIds.map((id) => s.members[id]).filter(Boolean))
  );
  const group = usePlannerStore((s) => s.groups[trip.groupId]);
  const pathname = usePathname();
  const onSplitBill = pathname?.endsWith("/split-bill");

  // On the workspace hub, "back" leaves the trip; anywhere deeper it returns to the hub.
  const atHub = pathname === `/trips/${trip.id}`;
  const back = atHub
    ? { href: `/groups/${trip.groupId}`, label: group ? `Back to ${group.name}` : "Back to group" }
    : { href: `/trips/${trip.id}`, label: `Back to ${trip.name}` };

  return (
    <div className="space-y-5">
      <Link
        href={back.href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
      >
        <ArrowLeft size={15} /> <span className="truncate">{back.label}</span>
      </Link>

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

      <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)] sm:p-4">
        <div className="min-w-0 flex-1">
          <ProgressStepper tripId={trip.id} current={trip.stage} />
        </div>
        <Link
          href={`/trips/${trip.id}/split-bill`}
          title="Split a bill"
          className={cx(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold shadow-[var(--shadow-soft)] transition-colors active:scale-[0.97]",
            onSplitBill
              ? "bg-[var(--color-primary)] text-white"
              : "bg-[var(--color-sand)] text-[var(--color-ink)] hover:bg-[var(--color-border)]"
          )}
        >
          <Receipt size={15} />
          <span className="hidden sm:inline">Split Bill</span>
        </Link>
      </div>
    </div>
  );
}
