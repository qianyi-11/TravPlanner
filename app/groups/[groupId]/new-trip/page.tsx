"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { ArrowLeft, Car, Footprints, MapPin, Plus, TrainFront, Shuffle, X, CarTaxiFront } from "lucide-react";
import Link from "next/link";
import { usePlannerStore } from "@/lib/store";
import type { TransportMode } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const TRANSPORT: { value: TransportMode; icon: typeof Car; label: string }[] = [
  { value: "Walking", icon: Footprints, label: "Walking" },
  { value: "Public Transport", icon: TrainFront, label: "Public Transport" },
  { value: "Car", icon: Car, label: "Car" },
  { value: "Taxi", icon: CarTaxiFront, label: "Taxi" },
  { value: "Mixed", icon: Shuffle, label: "Mixed" },
];

export default function NewTripPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const router = useRouter();
  const group = usePlannerStore((s) => s.groups[groupId]);
  const createTrip = usePlannerStore((s) => s.createTrip);

  const [destinations, setDestinations] = useState<string[]>([]);
  const [destInput, setDestInput] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState(2000);
  const [groupSize, setGroupSize] = useState(group?.memberIds.length ?? 1);
  const [dailyStart, setDailyStart] = useState("08:00");
  const [dailyEnd, setDailyEnd] = useState("22:00");
  const [transport, setTransport] = useState<TransportMode>("Mixed");

  if (!group) notFound();

  function addDestination() {
    const v = destInput.trim();
    if (v && !destinations.includes(v)) setDestinations([...destinations, v]);
    setDestInput("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (destinations.length === 0 || !startDate || !endDate) return;
    const id = createTrip(groupId, {
      name: name.trim() || destinations.join(" & "),
      destinations,
      startDate,
      endDate,
      budgetTotal: budget,
      groupSize,
      dailyStart,
      dailyEnd,
      transport,
    });
    router.push(`/trips/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/groups/${groupId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft size={15} /> Back to {group.name}
      </Link>

      <h1 className="font-display text-2xl font-bold sm:text-3xl">Set up your trip</h1>
      <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
        A few basics to get the group started — everyone can add ideas next.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Card className="p-5">
          <label className="mb-2 block text-sm font-semibold">Trip name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Japan Adventure"
            className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
          />
        </Card>

        <Card className="p-5">
          <label className="mb-2 block text-sm font-semibold">Destination(s)</label>
          <p className="mb-3 text-xs text-[var(--color-ink-soft)]">Add one or multiple cities.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
              <input
                value={destInput}
                onChange={(e) => setDestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDestination();
                  }
                }}
                placeholder="e.g. Tokyo"
                className="w-full rounded-xl border border-[var(--color-border)] py-3 pl-10 pr-4 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <Button type="button" variant="outline" icon={<Plus size={15} />} onClick={addDestination}>
              Add
            </Button>
          </div>
          {destinations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {destinations.map((d) => (
                <span
                  key={d}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--color-teal-soft)] px-3 py-1.5 text-sm font-medium text-[var(--color-teal-dark)]"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => setDestinations(destinations.filter((x) => x !== d))}
                    className="cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="grid grid-cols-2 gap-4 p-5">
          <div>
            <label className="mb-2 block text-sm font-semibold">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </Card>

        <Card className="p-5">
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
          <div className="mt-1 flex justify-between text-xs text-[var(--color-ink-soft)]">
            <span>RM 200</span>
            <span>RM 20,000</span>
          </div>
        </Card>

        <Card className="p-5">
          <label className="mb-2 flex items-center justify-between text-sm font-semibold">
            Group size <span className="font-display text-[var(--color-primary)]">{groupSize} travelers</span>
          </label>
          <p className="mb-2 text-xs text-[var(--color-ink-soft)]">Defaults to your group&apos;s member count.</p>
          <input
            type="range"
            min={1}
            max={Math.max(20, group.memberIds.length)}
            value={groupSize}
            onChange={(e) => setGroupSize(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
        </Card>

        <Card className="grid grid-cols-2 gap-4 p-5">
          <div>
            <label className="mb-2 block text-sm font-semibold">Daily start</label>
            <input
              type="time"
              value={dailyStart}
              onChange={(e) => setDailyStart(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Daily end</label>
            <input
              type="time"
              value={dailyEnd}
              onChange={(e) => setDailyEnd(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </Card>

        <Card className="p-5">
          <label className="mb-3 block text-sm font-semibold">Transport preference</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TRANSPORT.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setTransport(t.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3.5 text-xs font-semibold transition-colors ${
                  transport === t.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                    : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink)]"
                }`}
              >
                <t.icon size={18} />
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        <Button type="submit" fullWidth size="lg" disabled={destinations.length === 0 || !startDate || !endDate}>
          Create Trip
        </Button>
      </form>
    </div>
  );
}
