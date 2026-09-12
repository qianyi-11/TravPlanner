"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { ItineraryTimeline } from "@/components/trip/ItineraryTimeline";
import { MapView } from "@/components/trip/MapView";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { CalendarX } from "lucide-react";
import { cx, formatWeekday } from "@/lib/utils";

export default function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const placesMap = usePlannerStore((s) => s.places);
  const buildItinerary = usePlannerStore((s) => s.buildItinerary);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  if (!trip) notFound();

  if (trip.itinerary.length === 0) {
    const hasShortlist = trip.shortlistPlaceIds.length > 0;
    return (
      <div>
        <TripHeader trip={trip} />
        <div className="mt-6">
          <EmptyState
            icon={building ? Loader2 : CalendarX}
            title={building ? "Building your itinerary..." : "Itinerary not built yet"}
            description={
              hasShortlist
                ? "Your shortlist is ready — build the day-by-day plan from it now."
                : "Finish route optimization first, then we'll build your day-by-day plan."
            }
            action={
              hasShortlist ? (
                <Button disabled={building} onClick={() => { setBuilding(true); buildItinerary(tripId).finally(() => setBuilding(false)); }}>
                  {building ? "Building..." : "Build Itinerary Now"}
                </Button>
              ) : (
                <LinkButton href={`/trips/${tripId}/route`}>Go to Route</LinkButton>
              )
            }
          />
        </div>
      </div>
    );
  }

  const day = trip.itinerary[dayIndex];
  const dayPlaces = day.activities
    .filter((a) => a.type === "place" && a.placeId)
    .map((a) => placesMap[a.placeId as string])
    .filter(Boolean);
  const dayCost = day.activities.reduce((s, a) => s + a.estimatedCost, 0);

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Day-by-day itinerary</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {trip.itinerary.length} days · {trip.shortlistPlaceIds.length} activities
          </p>
        </div>
        <LinkButton href={`/trips/${tripId}/plan`} iconRight={<ArrowRight size={15} />}>
          View Final Plan
        </LinkButton>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {trip.itinerary.map((d, i) => (
          <button
            key={d.day}
            onClick={() => setDayIndex(i)}
            className={cx(
              "shrink-0 rounded-2xl border px-4 py-2.5 text-left transition-colors",
              i === dayIndex
                ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                : "border-[var(--color-border)] bg-white hover:border-[var(--color-ink)]"
            )}
          >
            <p className={cx("text-[10px] font-semibold uppercase", i === dayIndex ? "text-white/70" : "text-[var(--color-ink-soft)]")}>
              Day {d.day} · {formatWeekday(d.date)}
            </p>
            <p className="text-sm font-bold">{d.title}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{day.title}</h2>
            <span className="text-sm font-semibold text-[var(--color-ink-soft)]">~RM {dayCost} today</span>
          </div>
          <ItineraryTimeline
            activities={day.activities}
            places={placesMap}
            transport={trip.transport}
            tripId={tripId}
            selectedId={selected}
            onSelect={setSelected}
          />
        </div>

        <div className="lg:sticky lg:top-24">
          {dayPlaces.length > 0 ? (
            <MapView places={dayPlaces} selectedId={selected} onSelect={setSelected} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-ink-soft)]">
              No stops to map today
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
