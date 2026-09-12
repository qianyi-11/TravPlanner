"use client";

import { useState } from "react";
import { CalendarDays, Receipt, Settings, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import type { Trip } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { cx, formatCurrency, formatDateRange } from "@/lib/utils";
import { MemberStack } from "@/components/ui/Avatar";
import { ProgressStepper } from "./ProgressStepper";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { EditTripModal } from "./EditTripModal";

export function TripHeader({ trip }: { trip: Trip }) {
  const members = usePlannerStore(
    useShallow((s) => trip.memberIds.map((id) => s.members[id]).filter(Boolean))
  );
  const group = usePlannerStore((state) => state.groups[trip.groupId]);
  const currentUserId = usePlannerStore((state) => state.currentUserId);
  const renameTrip = usePlannerStore((state) => state.renameTrip);
  const [editOpen, setEditOpen] = useState(false);
  const isOrganizer = group?.organizerIds?.includes(currentUserId) ?? false;
  const pathname = usePathname();
  const onSplitBill = pathname?.endsWith("/split-bill");

  return (
    <div className="space-y-5">
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
        style={{ background: trip.coverColor }}
      >
        {isOrganizer && (
          <button type="button" onClick={() => setEditOpen(true)} title="Edit trip details" className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/20 text-white/90 hover:bg-black/35">
            <Settings size={16} />
          </button>
        )}
        <p className="text-sm font-medium text-white/70">{trip.destinations.join(" · ")}</p>
        {isOrganizer ? (
          <EditableTitle value={trip.name} onSave={(name) => renameTrip(trip.id, name)} label="Rename trip" className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl" inputClassName="font-display text-2xl font-bold text-white sm:text-3xl" />
        ) : (
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{trip.name}</h1>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
          <span className="flex items-center gap-1.5">
            <CalendarDays size={15} /> {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={15} /> {trip.memberIds.length} travelers
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
      {isOrganizer && editOpen && <EditTripModal trip={trip} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
