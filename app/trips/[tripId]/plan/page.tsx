"use client";

import { use, useState } from "react";
import { CalendarRange, ChevronDown, ListTree, MapPinned, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { LinkButton } from "@/components/ui/Button";
import { ActivityCard } from "@/components/trip/ActivityCard";
import { BudgetCard } from "@/components/trip/BudgetCard";
import { MapView, type MapLocation } from "@/components/trip/MapView";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { useCandidates } from "@/lib/hooks/use-candidates";
import { useActivityBudget } from "@/lib/hooks/use-activity-budget";
import { useFinalItinerary } from "@/lib/hooks/use-final-itinerary";
import { useTrip } from "@/lib/hooks/use-trip";
import { cx } from "@/lib/utils";
import type { ItineraryDay } from "@travel-planner/shared";

const tabs = [
  { key: "itinerary", label: "Itinerary", icon: ListTree },
  { key: "map", label: "Map", icon: MapPinned },
  { key: "budget", label: "Budget", icon: Wallet },
  { key: "places", label: "Places", icon: CalendarRange },
] as const;
type TabKey = (typeof tabs)[number]["key"];

export default function FinalPlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = useTrip(tripId);
  const itinerary = useFinalItinerary(tripId);
  const candidates = useCandidates(tripId);
  const budget = useActivityBudget(tripId);
  const [tab, setTab] = useState<TabKey>("itinerary");
  const [openDay, setOpenDay] = useState(0);

  if (trip.loading || itinerary.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading final plan…</p>;
  if (trip.error || itinerary.error || !trip.data) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || itinerary.error?.message || "Trip not found."}</p>;
  if (trip.data.phase !== "FINALIZED" || !itinerary.data) return <div className="space-y-4"><Card className="p-6"><h1 className="font-display text-2xl font-bold">Final plan is not ready</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">The trip must be finalized by the backend before a final itinerary version exists.</p><LinkButton className="mt-4" href={`/trips/${tripId}/itinerary`}>Open itinerary review</LinkButton></Card></div>;

  const days = itinerary.data.days;
  const locations = days.flatMap((day) => day.items).filter((item) => item.location).map((item) => ({ id: item.itemId, name: item.location!.name, lat: item.location!.lat, lng: item.location!.lng })) satisfies MapLocation[];
  const candidateById = new Map((candidates.data ?? []).map((candidate) => [candidate.id, candidate]));
  const itineraryItems = days.flatMap((day) => day.items);
  return <div><div className="relative overflow-hidden rounded-3xl bg-[var(--color-ink)] p-6 sm:p-8"><p className="text-sm font-medium text-white/70">{trip.data.destination.name}</p><h1 className="mt-1 break-words font-display text-2xl font-bold text-white sm:text-3xl">{trip.data.name}</h1><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90"><span>{trip.data.startDate} → {trip.data.endDate}</span><span>{days.length} days</span><span>{days.reduce((count, day) => count + day.items.length, 0)} activities</span></div></div><div className="mt-5 flex gap-1.5 overflow-x-auto scrollbar-none rounded-2xl border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-soft)]">{tabs.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={cx("flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors", tab === item.key ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]")}><item.icon size={14} /> {item.label}</button>)}</div><div className="mt-6">{tab === "itinerary" && <ItineraryTab days={days} openDay={openDay} setOpenDay={setOpenDay} tripId={tripId} />}{tab === "map" && <MapView locations={locations} />}{tab === "budget" && <BudgetCard budget={budget.data} currency={trip.data.activityBudgetCurrency} />}{tab === "places" && <div className="space-y-3">{itineraryItems.filter((item) => item.location).map((item) => { const candidate = item.candidateId ? candidateById.get(item.candidateId) : undefined; return candidate ? <PlaceCard key={item.itemId} candidate={candidate} /> : <Card key={item.itemId} className="p-4"><p className="font-semibold">{item.location!.name}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{item.location!.lat.toFixed(4)}, {item.location!.lng.toFixed(4)}</p></Card>; })}{itineraryItems.every((item) => !item.location) && <EmptyState title="No places in the final plan" description="The final itinerary has no mapped locations." icon={MapPinned} />}</div>}</div></div>;
}

function ItineraryTab({ days, openDay, setOpenDay, tripId }: { days: ItineraryDay[]; openDay: number; setOpenDay: (value: number) => void; tripId: string }) {
  if (days.length === 0) return <EmptyState icon={ListTree} title="No itinerary yet" />;
  return <div className="space-y-3">{days.map((day, index) => <Card key={day.date} className="overflow-hidden"><button type="button" onClick={() => setOpenDay(openDay === index ? -1 : index)} className="flex w-full items-center justify-between p-4 text-left"><div><p className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Day {index + 1} · {day.date}</p><p className="font-display text-base font-bold">{day.items.length} activities</p></div><ChevronDown size={16} className={cx("transition-transform", openDay === index && "rotate-180")} /></button>{openDay === index && <div className="space-y-2.5 border-t border-[var(--color-border-soft)] p-4">{day.items.map((item) => <ActivityCard key={item.itemId} item={item} />)}</div>}</Card>)}<LinkButton href={`/trips/${tripId}/itinerary`} variant="outline" fullWidth>Open full itinerary view</LinkButton></div>;
}
