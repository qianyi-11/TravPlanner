"use client";

import { useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import type { ItineraryActivity, Place } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function PlanBPicker({
  tripId,
  activity,
  backupPlace,
  candidates,
  itineraryRevision,
}: {
  tripId: string;
  activity: ItineraryActivity;
  backupPlace?: Place;
  candidates: Record<string, Place>;
  itineraryRevision: number;
}) {
  const hydrate = usePlannerStore((state) => state.hydrate);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(activity.backupPlaceId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = Object.values(candidates)
    .filter((place) => place.id !== activity.placeId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/itinerary/${activity.id}/backup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupPlaceId: selected, expectedItineraryRevision: itineraryRevision }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn’t save Plan B");
      await hydrate();
      setOpen(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Couldn’t save Plan B");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving || !activity.backupPlaceId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/itinerary/${activity.id}/backup`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedItineraryRevision: itineraryRevision }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn’t remove Plan B");
      await hydrate();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Couldn’t remove Plan B");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-dashed border-[var(--color-teal)] bg-[var(--color-teal-soft)] p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--color-teal-dark)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[var(--color-teal-dark)]">{backupPlace ? `Plan B: ${backupPlace.name}` : "No Plan B saved"}</p>
          {backupPlace ? (
            <p className="mt-0.5 text-xs text-[var(--color-teal-dark)]">
              {backupPlace.category} · {backupPlace.area} · ★ {backupPlace.rating} · Saved status: {backupPlace.availability}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--color-teal-dark)]">Prepare one backup place before disruption occurs.</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setSelected(activity.backupPlaceId ?? ""); setError(null); setOpen(true); }} disabled={!options.length}>
            {backupPlace ? "Change" : "Add Plan B"}
          </Button>
          {backupPlace && <Button type="button" size="sm" variant="ghost" onClick={() => void remove()} disabled={saving}>Remove</Button>}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="Choose Plan B">
        <p className="text-sm text-[var(--color-ink-soft)]">Select a saved trip place as the prepared backup for this stop.</p>
        <select
          aria-label="Plan B place"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="mt-4 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
        >
          <option value="">Choose a place</option>
          {options.map((place) => <option key={place.id} value={place.id}>{place.name} · {place.category} · {place.area}</option>)}
        </select>
        <p className="mt-3 flex items-start gap-2 text-xs text-[var(--color-ink-soft)]"><Check size={13} className="mt-0.5 shrink-0 text-[var(--color-success)]" /> Uses the place details already saved to this trip; availability is not live.</p>
        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
        <Button type="button" className="mt-5" fullWidth onClick={() => void save()} disabled={!selected || saving}>
          {saving ? "Saving…" : "Save Plan B"}
        </Button>
      </Modal>
    </div>
  );
}
