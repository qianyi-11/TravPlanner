"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeftRight, Receipt, Sparkles, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { SplitBillCalculator } from "@/components/trip/SplitBillCalculator";
import { CurrencyConverter } from "@/components/trip/CurrencyConverter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MemberStack } from "@/components/ui/Avatar";
import { cx, formatDateRange } from "@/lib/utils";

type Tab = "split" | "converter";

const TABS: { key: Tab; label: string; icon: typeof Receipt }[] = [
  { key: "split", label: "Split a Bill", icon: Receipt },
  { key: "converter", label: "Converter", icon: ArrowLeftRight },
];

export default function BillPage() {
  const trips = usePlannerStore(useShallow((s) => Object.values(s.trips)));
  const membersById = usePlannerStore((s) => s.members);
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const me = usePlannerStore((s) => s.members[currentUserId]);

  const [tab, setTab] = useState<Tab>("split");
  const [quickMode, setQuickMode] = useState(false);

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Bill</h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          Settle up after a shared expense, or check what something costs back home.
        </p>
      </div>

      <div className="mt-5 inline-flex rounded-2xl border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-soft)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.key
                ? "bg-[var(--color-ink)] text-white"
                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]"
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "split" && (
        <div className="mt-6">
          {!quickMode ? (
            <div className="space-y-6">
              {trips.length > 0 && (
                <div>
                  <h2 className="font-display text-base font-bold">Split for a trip</h2>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    Opens that trip&apos;s split with everyone in the travel group already added — you just
                    fill in what each person ordered.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {trips.map((trip) => {
                      const members = trip.memberIds.map((id) => membersById[id]).filter(Boolean);
                      return (
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
                            <div className="mt-2 flex items-center gap-2">
                              <MemberStack members={members} max={4} size="xs" />
                              <span className="flex items-center gap-1 text-xs text-[var(--color-ink-soft)]">
                                <Users size={11} /> {members.length} added
                              </span>
                            </div>
                          </div>
                          <ArrowRight
                            size={15}
                            className="shrink-0 text-[var(--color-ink-soft)] transition-transform group-hover:translate-x-0.5"
                          />
                        </Link>
                      );
                    })}
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
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    No trip needed — just a one-off calculation.
                  </p>
                </div>
                <Button size="sm" onClick={() => setQuickMode(true)}>
                  Start
                </Button>
              </Card>
            </div>
          ) : (
            <div className="max-w-2xl space-y-4">
              <button
                onClick={() => setQuickMode(false)}
                className="text-sm font-semibold text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                ← Back to trips
              </button>
              <SplitBillCalculator storageKey="trippy-split-quick" defaultNames={me ? [me.name] : []} />
            </div>
          )}
        </div>
      )}

      {tab === "converter" && (
        <div className="mt-6 max-w-3xl">
          <CurrencyConverter />
        </div>
      )}
    </div>
  );
}
