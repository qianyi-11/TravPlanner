"use client";

import { useEffect, useState } from "react";
import { Check, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

interface ChecklistItem {
  id: string;
  title: string;
  assignedMemberId: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function TripChecklist({ tripId }: { tripId: string }) {
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const membersMap = usePlannerStore((s) => s.members);
  const members = trip?.memberIds.map((id) => membersMap[id]).filter(Boolean) ?? [];
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [title, setTitle] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/trips/${tripId}/checklist`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { items?: ChecklistItem[]; error?: string };
        if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error ?? "Couldn’t load checklist");
        if (active) setItems(data.items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Couldn’t load checklist");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tripId]);

  async function mutate(itemId: string, body: Record<string, unknown>) {
    if (saving) return;
    setSaving(itemId);
    setError(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { item?: ChecklistItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Couldn’t save checklist item");
      setItems((current) => current.map((item) => (item.id === itemId ? data.item! : item)));
      setEditingId(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Couldn’t save checklist item");
    } finally {
      setSaving(null);
    }
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving("new");
    setError(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, assignedMemberId: assignedMemberId || null }),
      });
      const data = (await response.json().catch(() => ({}))) as { item?: ChecklistItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Couldn’t add checklist item");
      setItems((current) => [...current, data.item!]);
      setTitle("");
      setAssignedMemberId("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Couldn’t add checklist item");
    } finally {
      setSaving(null);
    }
  }

  async function removeItem(itemId: string) {
    if (saving) return;
    setSaving(itemId);
    setError(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/checklist/${itemId}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn’t delete checklist item");
      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Couldn’t delete checklist item");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
          <ListChecks size={18} />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">Shared checklist</h2>
          <p className="text-sm text-[var(--color-ink-soft)]">Keep trip preparation visible for everyone.</p>
        </div>
      </div>

      <form onSubmit={addItem} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="Add a task"
          aria-label="Checklist task"
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <select
          value={assignedMemberId}
          onChange={(event) => setAssignedMemberId(event.target.value)}
          aria-label="Assign checklist task"
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
        >
          <option value="">Anyone</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!title.trim() || saving !== null} icon={<Plus size={14} />}>
          Add
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-ink-soft)]"><Loader2 size={15} className="animate-spin" /> Loading checklist…</div>
      ) : items.length === 0 ? (
        <div className="mt-4"><EmptyState icon={ListChecks} title="No tasks yet" description="Add the first shared trip task above." /></div>
      ) : (
        <div className="mt-4 divide-y divide-[var(--color-border-soft)] rounded-xl border border-[var(--color-border)]">
          {items.map((item) => {
            const assigned = item.assignedMemberId ? membersMap[item.assignedMemberId] : undefined;
            const editing = editingId === item.id;
            return (
              <div key={item.id} className="flex items-center gap-2.5 p-3">
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={saving !== null}
                  onChange={(event) => void mutate(item.id, { completed: event.target.checked })}
                  aria-label={`Mark ${item.title} complete`}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {editing ? (
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    maxLength={120}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (draftTitle.trim()) void mutate(item.id, { title: draftTitle });
                      }
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                ) : (
                  <span className={`min-w-0 flex-1 truncate text-sm ${item.completed ? "text-[var(--color-ink-soft)] line-through" : "font-medium"}`}>
                    {item.title}
                  </span>
                )}
                <select
                  value={item.assignedMemberId ?? ""}
                  onChange={(event) => void mutate(item.id, { assignedMemberId: event.target.value || null })}
                  disabled={saving !== null}
                  aria-label={`Assign ${item.title}`}
                  className="max-w-28 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-ink-soft)] outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="">Anyone</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
                {assigned && <span className="hidden text-xs text-[var(--color-ink-soft)] sm:inline">{assigned.initials}</span>}
                {editing ? (
                  <>
                    <button type="button" onClick={() => draftTitle.trim() && void mutate(item.id, { title: draftTitle })} disabled={saving !== null || !draftTitle.trim()} aria-label="Save checklist title" className="text-[var(--color-success)]"><Check size={15} /></button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={saving !== null} aria-label="Cancel checklist title" className="text-[var(--color-ink-soft)]"><X size={15} /></button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setEditingId(item.id); setDraftTitle(item.title); }} aria-label={`Edit ${item.title}`} className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"><Pencil size={14} /></button>
                )}
                <button type="button" onClick={() => void removeItem(item.id)} disabled={saving !== null} aria-label={`Delete ${item.title}`} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
