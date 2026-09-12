"use client";

import { use, useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { usePlannerStore } from "@/lib/store";

const STEPS = [
  "Combining preferences",
  "Finding places",
  "Checking suitability",
  "Ranking candidates",
];

export default function GeneratingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const setStage = usePlannerStore((s) => s.setStage);
  const [stepIndex, setStepIndex] = useState(0);
  const [persisting, setPersisting] = useState(false);

  useEffect(() => {
    if (stepIndex >= STEPS.length) {
      const t = setTimeout(async () => {
        setPersisting(true);
        if (await setStage(tripId, "voting")) router.push(`/trips/${tripId}/vote`);
        else setPersisting(false);
      }, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStepIndex((i) => i + 1), 850);
    return () => clearTimeout(t);
  }, [stepIndex, router, setStage, tripId]);

  if (!trip) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--color-primary-soft)]">
        <Loader2 size={26} className="animate-spin text-[var(--color-primary)]" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">Finding the best options for your group…</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
        Combining everyone&apos;s preferences and suggestions for {trip.name}.
      </p>

      <div className="mt-8 w-full space-y-3 text-left">
        {STEPS.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div
              key={step}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                done
                  ? "border-[var(--color-teal)] bg-[var(--color-teal-soft)]"
                  : active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                  : "border-[var(--color-border)] bg-white opacity-50"
              }`}
            >
              {done ? (
                <Check size={16} className="text-[var(--color-teal-dark)]" />
              ) : active ? (
                <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-[var(--color-border)]" />
              )}
              <span
                className={`text-sm font-medium ${
                  done ? "text-[var(--color-teal-dark)]" : active ? "text-[var(--color-primary-dark)]" : "text-[var(--color-ink-soft)]"
                }`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
      {persisting && <p className="mt-4 text-xs text-[var(--color-ink-soft)]">Saving your planning stage…</p>}
    </div>
  );
}
