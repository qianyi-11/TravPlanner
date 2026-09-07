"use client";

import { use, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { generatePlanningCycle } from "@/lib/api/planning";
import { useItineraryOptions } from "@/lib/hooks/use-itinerary-options";
import { useTrip } from "@/lib/hooks/use-trip";

export default function GeneratingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = useTrip(tripId);
  const options = useItineraryOptions(tripId, trip.data?.planningCycle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!trip.data) return;
    setPending(true); setError(null);
    try { await generatePlanningCycle({ tripId, expectedPlanningCycle: trip.data.planningCycle }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Planning generation failed."); }
    finally { setPending(false); }
  }

  if (trip.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading planning state…</p>;
  if (trip.error || options.error || !trip.data) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || options.error?.message || "Trip not found."}</p>;
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{trip.data.name}</p><h1 className="mt-2 font-display text-3xl font-extrabold">Planning options</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">The backend generates up to three validated alternatives from the current cycle.</p></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{trip.data.phase === "PLANNING" && options.data?.length === 0 && <Card className="p-6"><p className="text-sm">No options are available for planning cycle {trip.data.planningCycle}.</p><Button className="mt-4" disabled={pending} onClick={generate}>{pending ? "Generating…" : "Generate planning options"}</Button></Card>}{options.loading && <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm">Waiting for generated options…</p>}{options.data && options.data.length > 0 && <div className="grid gap-5 lg:grid-cols-3">{options.data.map((option) => <OptionCard key={option.id} option={option} />)}</div>}{trip.data.phase !== "PLANNING" && <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-soft)]">The trip is currently {trip.data.phase}. Options will appear when the backend enters PLANNING.</p>}</div>;
}

function OptionCard({ option }: { option: { id: string; variant: string; days: Array<{ date: string; items: Array<{ title: string; startTime: string; endTime: string; location?: { name: string } }> }>; score: { mustDo: number; votePreference: number; travelEfficiency: number; gapEfficiency: number; budgetEfficiency: number; preferredPeriod: number } } }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{option.variant}</p><h2 className="mt-2 font-display text-xl font-bold">Option {option.id.slice(0, 6)}</h2><div className="mt-4 space-y-3">{option.days.map((day) => <div key={day.date}><p className="text-sm font-semibold">{day.date}</p>{day.items.map((item) => <p key={`${day.date}-${item.title}-${item.startTime}`} className="mt-1 text-xs text-[var(--color-ink-soft)]">{item.startTime}–{item.endTime} · {item.title}{item.location ? ` · ${item.location.name}` : ""}</p>)}</div>)}</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--color-ink-soft)]"><span>Must-do {option.score.mustDo}</span><span>Preference {option.score.votePreference}</span><span>Travel {option.score.travelEfficiency}</span><span>Gaps {option.score.gapEfficiency}</span><span>Budget {option.score.budgetEfficiency}</span><span>Period {option.score.preferredPeriod}</span></div></Card>;
}
