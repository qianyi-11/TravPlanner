"use client";

import { useState } from "react";
import { Bike, Bus, Car, CarTaxiFront, Footprints, Loader2, Shuffle } from "lucide-react";
import type { TransportMode, Trip } from "@/lib/types";
import { usePlannerStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const TRANSPORT = [
  { value: "Walking", icon: Footprints },
  { value: "Public Transport", icon: Bus },
  { value: "Car", icon: Car },
  { value: "Taxi", icon: CarTaxiFront },
  { value: "Mixed", icon: Shuffle },
] as const satisfies readonly { value: TransportMode; icon: typeof Bike }[];

export function EditTripModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const updateTripDetails = usePlannerStore((state) => state.updateTripDetails);
  const showToast = usePlannerStore((state) => state.showToast);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [budgetTotal, setBudgetTotal] = useState(trip.budgetTotal);
  const [dailyStart, setDailyStart] = useState(trip.dailyStart);
  const [dailyEnd, setDailyEnd] = useState(trip.dailyEnd);
  const [transport, setTransport] = useState<TransportMode>(trip.transport);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (await updateTripDetails(trip.id, { startDate, endDate, budgetTotal, dailyStart, dailyEnd, transport })) {
        showToast("Trip details updated");
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit trip details" maxWidth="max-w-lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 font-normal outline-none" /></label>
          <label className="text-sm font-semibold">End date<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 font-normal outline-none" /></label>
        </div>
        <label className="block text-sm font-semibold">Trip budget<input type="number" min={0} step={1} value={budgetTotal} onChange={(event) => setBudgetTotal(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 font-normal outline-none" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Daily start<input type="time" value={dailyStart} onChange={(event) => setDailyStart(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 font-normal outline-none" /></label>
          <label className="text-sm font-semibold">Daily end<input type="time" value={dailyEnd} onChange={(event) => setDailyEnd(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 font-normal outline-none" /></label>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Transport preference</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TRANSPORT.map(({ value, icon: Icon }) => (
              <button key={value} type="button" onClick={() => setTransport(value)} className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold ${transport === value ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]"}`}>
                <Icon size={16} /> {value}
              </button>
            ))}
          </div>
        </div>
        <Button fullWidth size="lg" onClick={save} disabled={saving} icon={saving ? <Loader2 size={15} className="animate-spin" /> : undefined}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </Modal>
  );
}
