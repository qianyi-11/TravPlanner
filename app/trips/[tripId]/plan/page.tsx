"use client";

import { use } from "react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { useFinalItinerary } from "@/lib/hooks/use-final-itinerary";
import { useTrip } from "@/lib/hooks/use-trip";
import type { ItineraryDay } from "@travel-planner/shared";

export default function FinalPlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = useTrip(tripId);
  const itinerary = useFinalItinerary(tripId);

  if (trip.loading || itinerary.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading final plan…</p>;
  if (trip.error || itinerary.error || !trip.data) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || itinerary.error?.message || "Trip not found."}</p>;
  if (trip.data.phase !== "FINALIZED" || !itinerary.data) return <div className="space-y-4"><Card className="p-6"><h1 className="font-display text-2xl font-bold">Final plan is not ready</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">The trip must be finalized by the backend before a final itinerary version exists.</p><LinkButton className="mt-4" href={`/trips/${tripId}/itinerary`}>Open itinerary review</LinkButton></Card></div>;

  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{trip.data.name}</p><h1 className="mt-2 font-display text-3xl font-extrabold">Final trip plan</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Version {itinerary.data.versionNumber} · authoritative finalized itinerary.</p></div><div className="space-y-4">{itinerary.data.days.map(day => <FinalDay key={day.date} day={day} />)}</div></div>;
}

function FinalDay({ day }: { day: ItineraryDay }) {
  return <Card className="p-5"><p className="text-sm font-semibold">{day.date}</p><div className="mt-4 space-y-3">{day.items.map(item => <div key={item.itemId} className="rounded-xl border border-[var(--color-border-soft)] p-3"><p className="text-sm font-semibold">{item.startTime}–{item.endTime} · {item.title}</p>{item.location && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{item.location.name}</p>}</div>)}</div></Card>;
}
