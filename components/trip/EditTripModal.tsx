"use client";

import { useEffect, useState } from "react";
import { Car, CarTaxiFront, Footprints, Loader2, Shuffle, TrainFront, UserPlus } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import type { TransportMode, Trip } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MemberAvatar } from "@/components/ui/Avatar";
import { useShallow } from "zustand/react/shallow";

const TRANSPORT: { value: TransportMode; icon: typeof Car; label: string }[] = [
  { value: "Walking", icon: Footprints, label: "Walking" },
  { value: "Public Transport", icon: TrainFront, label: "Public" },
  { value: "Car", icon: Car, label: "Car" },
  { value: "Taxi", icon: CarTaxiFront, label: "Taxi" },
  { value: "Mixed", icon: Shuffle, label: "Mixed" },
];

export function EditTripModal({
  trip,
  open,
  onClose,
}: {
  trip: Trip;
  open: boolean;
  onClose: () => void;
}) {
  const updateTripDetails = usePlannerStore((s) => s.updateTripDetails);
  const addMember = usePlannerStore((s) => s.addMember);
  const showToast = usePlannerStore((s) => s.showToast);
  const members = usePlannerStore(
    useShallow((s) => trip.memberIds.map((id) => s.members[id]).filter(Boolean))
  );

  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [budget, setBudget] = useState(trip.budgetTotal);
  const [dailyStart, setDailyStart] = useState(trip.dailyStart);
  const [dailyEnd, setDailyEnd] = useState(trip.dailyEnd);
  const [transport, setTransport] = useState<TransportMode>(trip.transport);
  const [newMemberName, setNewMemberName] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset the draft to the latest trip whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setBudget(trip.budgetTotal);
    setDailyStart(trip.dailyStart);
    setDailyEnd(trip.dailyEnd);
    setTransport(trip.transport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip.id]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    setAddingMember(true);
    await addMember(trip.groupId, name);
    setAddingMember(false);
    setNewMemberName("");
    showToast(`${name} added to the trip`);
  }

  async function handleSave() {
    setSaving(true);
    const ok = await updateTripDetails(trip.id, {
      startDate,
      endDate,
      budgetTotal: budget,
      dailyStart,
      dailyEnd,
      transport,
    });
    setSaving(false);
    if (ok) {
      showToast("Trip details updated");
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit trip details" maxWidth="max-w-lg">
      <div className="space-y-6">
        <div>
          <h4 className="mb-3 text-sm font-semibold">Travelers</h4>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <MemberAvatar member={m} size="sm" />
                <span className="text-sm font-medium">
                  {m.name} {m.isYou && <span className="text-[var(--color-ink-soft)] font-normal">(you)</span>}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddMember} className="mt-3 flex gap-2">
            <input
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Add a traveler by name"
              disabled={addingMember}
              className="w-full min-w-0 flex-1 rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!newMemberName.trim() || addingMember}
              icon={addingMember ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            >
              Add
            </Button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 flex items-center justify-between text-sm font-semibold">
            Trip budget <span className="font-display text-[var(--color-primary)]">RM {budget.toLocaleString()}</span>
          </label>
          <input
            type="range"
            min={200}
            max={20000}
            step={100}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Daily start</label>
            <input
              type="time"
              value={dailyStart}
              onChange={(e) => setDailyStart(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Daily end</label>
            <input
              type="time"
              value={dailyEnd}
              onChange={(e) => setDailyEnd(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold">Transport preference</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TRANSPORT.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTransport(t.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                  transport === t.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                    : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink)]"
                }`}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Button fullWidth size="lg" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </Modal>
  );
}
