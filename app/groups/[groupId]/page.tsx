"use client";

import { use, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { Compass, Plus, Trash2, UserPlus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/States";
import { MemberAvatar } from "@/components/ui/Avatar";
import { TripCard } from "@/components/trip/TripCard";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function GroupRoomPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const router = useRouter();
  const group = usePlannerStore((s) => s.groups[groupId]);
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const members = usePlannerStore(
    useShallow((s) => (group ? group.memberIds.map((id) => s.members[id]).filter(Boolean) : []))
  );
  const trips = usePlannerStore(
    useShallow((s) => (group ? group.tripIds.map((id) => s.trips[id]).filter(Boolean) : []))
  );
  const addMember = usePlannerStore((s) => s.addMember);
  const renameGroup = usePlannerStore((s) => s.renameGroup);
  const deleteGroup = usePlannerStore((s) => s.deleteGroup);
  const createGroupInvite = usePlannerStore((s) => s.createGroupInvite);
  const showToast = usePlannerStore((s) => s.showToast);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isOrganizer = group?.organizerIds?.includes(currentUserId) ?? false;

  if (!group) notFound();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || addingMember) return;
    setAddingMember(true);
    try {
      if (await addMember(groupId, name.trim())) {
        setName("");
        setAddOpen(false);
      }
    } finally {
      setAddingMember(false);
    }
  }

  async function handleInvite() {
    if (creatingInvite) return;
    setCreatingInvite(true);
    try {
      const token = await createGroupInvite(groupId);
      const link = `${window.location.origin}/join/${token}`;
      setInviteLink(link);
      await navigator.clipboard?.writeText(link);
      showToast("Invite link copied");
    } catch {
      // The store already surfaces the server error.
    } finally {
      setCreatingInvite(false);
    }
  }

  return (
    <div>
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
              {isOrganizer ? (
                <EditableTitle value={group.name} onSave={(name) => renameGroup(groupId, name)} className="font-display text-2xl font-bold text-white sm:text-3xl" />
              ) : (
                <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{group.name}</h1>
              )}
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
            {isOrganizer && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-sand)] text-[var(--color-ink)] hover:bg-[var(--color-border)] cursor-pointer"
              >
                <UserPlus size={15} />
              </button>
            )}
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
          {isOrganizer && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="sm" icon={<UserPlus size={14} />} onClick={() => setAddOpen(true)}>
                Add Member
              </Button>
              <Button variant="secondary" size="sm" disabled={creatingInvite} onClick={handleInvite}>
                {creatingInvite ? "Creating…" : "Copy invite link"}
              </Button>
            </div>
          )}
          {inviteLink && <p className="mt-2 break-all text-xs text-[var(--color-ink-soft)]">{inviteLink}</p>}
        </Card>
      </div>

      {isOrganizer && (
        <Card className="mt-6 border-[var(--color-danger)] p-5">
          <h2 className="font-display text-base font-bold text-[var(--color-danger)]">Danger Zone</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Delete this group and all planning data inside it.</p>
          <Button className="mt-4" variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleteOpen(true)}>
            Delete Group
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${group.name}?`}
        description={`${trips.length} trip${trips.length === 1 ? "" : "s"} and all related planning data will be deleted. This cannot be undone.`}
        confirmLabel="Delete Group"
        danger
        onConfirm={async () => {
          if (await deleteGroup(groupId)) {
            showToast(`${group.name} was deleted`);
            router.push("/groups");
          }
        }}
      />

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
          <Button type="submit" fullWidth disabled={!name.trim() || addingMember}>
            {addingMember ? "Adding…" : "Add to Group"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
