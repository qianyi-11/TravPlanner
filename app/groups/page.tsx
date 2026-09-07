"use client";

import { Plus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { LinkButton } from "@/components/ui/Button";
import { GroupCard } from "@/components/trip/GroupCard";
import { usePlannerStore } from "@/lib/store";

export default function GroupsPage() {
  const groups = usePlannerStore(useShallow((s) => Object.values(s.groups)));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Your groups</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Shared rooms where your travel crews plan trips together.
          </p>
        </div>
        <LinkButton href="/groups/new" icon={<Plus size={16} />}>
          New Group
        </LinkButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <GroupCard key={g.id} group={g} />
        ))}
      </div>
    </div>
  );
}
