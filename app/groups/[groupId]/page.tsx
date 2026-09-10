"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Compass, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/States";
import { MemberAvatar } from "@/components/ui/Avatar";
import { TripCard } from "@/components/trip/TripCard";

export default function GroupRoomPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const group = usePlannerStore((s) => s.groups[groupId]);
  const members = usePlannerStore(
    useShallow((s) => (group ? group.memberIds.map((id) => s.members[id]).filter(Boolean) : []))
  );
  const trips = usePlannerStore(
    useShallow((s) => (group ? group.tripIds.map((id) => s.trips[id]).filter(Boolean) : []))
  );
  const addMember = usePlannerStore((s) => s.addMember);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");

  if (!group) notFound();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addMember(groupId, name.trim());
    setName("");
    setAddOpen(false);
  }

  return (
    <div>
      <Link
        href="/groups"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
      >
        <ArrowLeft size={15} /> Back to groups
      </Link>

      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
        style={{ background: group.coverColor }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl backdrop-blur">
              {group.emoji}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
                {group.name} {group.emoji}
              </h1>
              {group.description && (
                <p className="mt-1 max-w-md text-sm text-white/75">{group.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Trips</h2>
            <LinkButton href={`/groups/${groupId}/new-trip`} size="sm" icon={<Plus size={15} />}>
              Start Planning a Trip
            </LinkButton>
          </div>

          {trips.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No trips yet"
              description="Kick things off by planning your first trip together."
              action={
                <LinkButton href={`/groups/${groupId}/new-trip`} icon={<Plus size={16} />}>
                  Start Planning a Trip
                </LinkButton>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {trips.map((t) => (
                <TripCard key={t.id} trip={t} />
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">
              Members <span className="text-[var(--color-ink-soft)] font-normal">({members.length})</span>
            </h2>
            <button
              onClick={() => setAddOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-sand)] text-[var(--color-ink)] hover:bg-[var(--color-border)] cursor-pointer"
            >
              <UserPlus size={15} />
            </button>
          </div>
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <MemberAvatar member={m} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {m.name} {m.isYou && <span className="text-[var(--color-ink-soft)] font-normal">(you)</span>}
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)] capitalize">{m.role ?? "member"}</p>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" fullWidth size="sm" className="mt-4" icon={<UserPlus size={14} />} onClick={() => setAddOpen(true)}>
            Add Member
          </Button>
        </Card>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a member">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya"
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <Button type="submit" fullWidth disabled={!name.trim()}>
            Add to Group
          </Button>
        </form>
      </Modal>
    </div>
  );
}
