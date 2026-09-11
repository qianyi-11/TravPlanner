"use client";

import { use, useMemo, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { ArrowRight, Layers, MapPin, Route as RouteIcon } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { MapView } from "@/components/trip/MapView";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { ItineraryTimeline } from "@/components/trip/ItineraryTimeline";
import { Card, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Place } from "@/lib/types";
import { getActivePlanPlaceIds } from "@/lib/plan-places";

export default function RoutePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const placesMap = usePlannerStore((s) => s.places);
  const buildItinerary = usePlannerStore((s) => s.buildItinerary);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const orderedFromItinerary: Place[] = useMemo(() => {
    return trip ? getActivePlanPlaceIds(trip).map((id) => placesMap[id]).filter(Boolean) : [];
  }, [trip, placesMap]);

  const groups = useMemo(() => {
    const map = new Map<string, Place[]>();
    for (const p of orderedFromItinerary) {
      const key = `${p.area} · ${p.destination}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [orderedFromItinerary]);

  if (!trip) notFound();

  async function handleContinue() {
    if (trip.itinerary.length) {
      router.push(`/trips/${tripId}/itinerary`);
      return;
    }
    setBuilding(true);
    const built = await buildItinerary(tripId);
    setBuilding(false);
    if (built) router.push(`/trips/${tripId}/itinerary`);
  }

  let runningIndex = 0;

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Trip sequence preview</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Review the saved stop order and area grouping for your trip.
          </p>
        </div>
        <Button onClick={handleContinue} disabled={building} aria-busy={building} iconRight={<ArrowRight size={15} />}>
          {trip.itinerary.length ? "View Itinerary" : building ? "Building..." : "Build Itinerary"}
        </Button>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[var(--color-teal)] bg-[var(--color-teal-soft)] p-4">
        <Layers size={18} className="mt-0.5 shrink-0 text-[var(--color-teal-dark)]" />
        <p className="text-sm text-[var(--color-teal-dark)]">
          Stops are shown by their saved area and itinerary sequence. The map previews that order.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="order-2 space-y-5 lg:order-1">
          {groups.map(([area, places]) => (
            <div key={area}>
              <div className="mb-2 flex items-center gap-2">
                <MapPin size={13} className="text-[var(--color-ink-soft)]" />
                <h3 className="text-sm font-bold text-[var(--color-ink)]">{area}</h3>
                <Badge tone="neutral">{places.length} stop{places.length > 1 ? "s" : ""}</Badge>
              </div>
              <div className="space-y-2">
                {places.map((place) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  return (
                    <div
                      key={place.id}
                      onClick={() => setSelected(place.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-2.5 transition-all ${
                        selected === place.id
                          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-ink)]"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] font-display text-xs font-bold text-white">
                        {idx}
                      </span>
                      <PlaceCover photo={place.photo} category={place.category} className="h-11 w-11 shrink-0 rounded-lg" iconSize={14} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{place.name}</p>
                        <p className="text-xs text-[var(--color-ink-soft)]">{place.category}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-24">
          <MapView places={orderedFromItinerary} selectedId={selected} onSelect={setSelected} />
        </div>
      </div>

      {trip.itinerary.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <RouteIcon size={16} className="text-[var(--color-ink-soft)]" />
            <h2 className="font-display text-lg font-bold">Planned stop sequence</h2>
          </div>
          <Card className="p-5">
            <ItineraryTimeline
              activities={trip.itinerary[0].activities}
              places={placesMap}
              transport={trip.transport}
              tripId={tripId}
              selectedId={selected}
              onSelect={setSelected}
            />
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Showing Day 1 as an example — full days appear in your itinerary.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
