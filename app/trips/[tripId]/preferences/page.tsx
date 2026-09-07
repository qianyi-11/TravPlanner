"use client";

import { use, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { setActivityBudget } from "@/lib/api/budget";
import { useActivityBudget } from "@/lib/hooks/use-activity-budget";
import { useTrip } from "@/lib/hooks/use-trip";

export default function PreferencesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = useTrip(tripId);
  const budget = useActivityBudget(tripId);
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trip.data) return;
    setPending(true); setMessage(null);
    try { await setActivityBudget({ tripId, expectedPlanningCycle: trip.data.planningCycle, amount: Number(amount) }); setAmount(""); setMessage("Budget saved."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Budget could not be saved."); }
    finally { setPending(false); }
  }

  async function clear() {
    if (!trip.data) return;
    setPending(true); setMessage(null);
    try { await setActivityBudget({ tripId, expectedPlanningCycle: trip.data.planningCycle, clear: true }); setMessage("Budget cleared."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Budget could not be cleared."); }
    finally { setPending(false); }
  }

  if (trip.loading || budget.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading budget…</p>;
  if (trip.error || budget.error || !trip.data) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || budget.error?.message || "Trip not found."}</p>;
  return <div className="mx-auto max-w-lg"><h1 className="font-display text-3xl font-extrabold">Activity budget</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Set your private per-trip activity budget in {trip.data.activityBudgetCurrency}.</p><Card className="mt-8 p-6"><p className="text-sm font-semibold">Current budget</p><p className="mt-2 font-display text-3xl font-bold">{budget.data ? `${budget.data.currency} ${budget.data.amount.toLocaleString()}` : "Not set"}</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-semibold">New amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="1000" /></label><Button type="submit" fullWidth disabled={pending}>{pending ? "Saving…" : "Save budget"}</Button>{budget.data && <Button type="button" variant="outline" fullWidth disabled={pending} onClick={clear}>Clear budget</Button>}{message && <p className="rounded-xl bg-[var(--color-sand)] p-3 text-sm">{message}</p>}</form></Card></div>;
}
