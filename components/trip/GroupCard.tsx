"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Group } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { MemberStack } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function GroupCard({ group }: { group: Group }) {
  const members = usePlannerStore(
    useShallow((s) => group.memberIds.map((id) => s.members[id]).filter(Boolean))
  );
  const trips = usePlannerStore(
    useShallow((s) => group.tripIds.map((id) => s.trips[id]).filter(Boolean))
  );
  const deleteGroup = usePlannerStore((s) => s.deleteGroup);
  const showToast = usePlannerStore((s) => s.showToast);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Link
        href={`/groups/${group.id}`}
        className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-card)]"
      >
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
          style={{ background: group.coverColor }}
        >
          {group.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-[var(--color-ink)]">{group.name}</h3>
          <p className="truncate text-sm text-[var(--color-ink-soft)]">
            {group.memberIds.length} members
            {trips.length > 0 && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} className="inline" /> {trips.length} trip{trips.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </p>
        </div>
        <MemberStack members={members} max={4} size="sm" />
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          title="Delete group"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={15} />
        </button>
      </Link>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete this group?"
        description={`"${group.name}" will be permanently deleted${
          trips.length > 0
            ? `, along with ${trips.length} trip${trips.length > 1 ? "s" : ""} inside it and all their suggestions, votes and itineraries`
            : ""
        }. This can't be undone.`}
        confirmLabel="Delete Group"
        danger
        onConfirm={async () => {
          await deleteGroup(group.id);
          showToast(`${group.name} was deleted`);
        }}
      />
    </>
  );
}
