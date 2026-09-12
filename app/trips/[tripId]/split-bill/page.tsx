"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { SplitBillCalculator } from "@/components/trip/SplitBillCalculator";

export default function SplitBillPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const members = usePlannerStore(
    useShallow((s) => (trip ? trip.memberIds.map((id) => s.members[id]).filter(Boolean) : []))
  );

  if (!trip) notFound();

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6">
        <h1 className="font-display text-2xl font-bold">Split the Bill</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Break down a shared expense — a meal, a taxi, a shopping haul — and see who owes what.
        </p>
      </div>

      <div className="mt-6 max-w-2xl">
        <SplitBillCalculator
          storageKey={`trippy-split-${tripId}`}
          defaultNames={members.map((m) => m.name)}
          tripId={tripId}
        />
      </div>
    </div>
  );
}
