"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Receipt, Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { SplitBillCalculator } from "@/components/trip/SplitBillCalculator";
import { CurrencyConverter } from "@/components/trip/CurrencyConverter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cx, formatDateRange } from "@/lib/utils";

type View = "split" | "converter";

export default function GlobalSplitBillPage() {
  const trips = usePlannerStore(useShallow((s) => Object.values(s.trips)));
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const me = usePlannerStore((s) => s.members[currentUserId]);
  const [quickMode, setQuickMode] = useState(false);
  const [view, setView] = useState<View>("split");

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Split a Bill</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Break down a shared expense or estimate a reference currency conversion.
        </p>
      </div>

      <div className="mt-5 inline-flex rounded-2xl border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-soft)]">
        {(["split", "converter"] as View[]).map((item) => {
          const Icon = item === "split" ? Receipt : ArrowLeftRight;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={cx(
                "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold",
                view === item ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]"
              )}
            >
              <Icon size={15} />
              {item === "split" ? "Split Bill" : "Reference Converter"}
            </button>
          );
        })}
      </div>

      {view === "split" && !quickMode && (
        <div className="mt-8 space-y-6">
          {trips.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-base font-bold">Split for a trip</h2>
              <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
                Pulls in that trip&apos;s travelers automatically, and keeps your split saved there.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {trips.map((trip) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}/split-bill`}
                    className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-card)]"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: trip.coverColor }}
                    >
                      <Receipt size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-bold">{trip.name}</p>
                      <p className="truncate text-xs text-[var(--color-ink-soft)]">
                        {formatDateRange(trip.startDate, trip.endDate)}
                      </p>
                    </div>
                    <ArrowRight size={15} className="shrink-0 text-[var(--color-ink-soft)] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            or
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <Card className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold">Quick split</p>
              <p className="text-xs text-[var(--color-ink-soft)]">No trip needed — just a one-off calculation.</p>
            </div>
            <Button size="sm" onClick={() => setQuickMode(true)}>
              Start
            </Button>
          </Card>
        </div>
      )}

      {view === "split" && quickMode && (
        <div className="mt-6 max-w-2xl">
          <SplitBillCalculator storageKey="trippy-split-quick" defaultNames={me ? [me.name] : []} />
        </div>
      )}

      {view === "converter" && (
        <div className="mt-6 max-w-3xl">
          <CurrencyConverter />
        </div>
      )}
    </div>
  );
}
