"use client";

import { ChevronRight, Footprints, Car, TrainFront } from "lucide-react";
import type { ItineraryActivity, Place, TransportMode } from "@/lib/types";
import { ActivityCard } from "./ActivityCard";

function directionsMode(transport: TransportMode | undefined, minutes: number): {
  label: string;
  icon: typeof Footprints;
  travelmode: "walking" | "driving" | "transit";
} {
  if (transport === "Walking" || (transport === "Mixed" && minutes <= 15)) {
    return { label: "Walk", icon: Footprints, travelmode: "walking" };
  }
  if (transport === "Public Transport") {
    return { label: "Transit", icon: TrainFront, travelmode: "transit" };
  }
  return { label: transport === "Taxi" ? "Taxi or Grab" : "Drive", icon: Car, travelmode: "driving" };
}

export function ItineraryTimeline({
  activities,
  places,
  transport,
  tripId,
  selectedId,
  onSelect,
  activeIndex,
}: {
  activities: ItineraryActivity[];
  places: Record<string, Place>;
  transport?: TransportMode;
  tripId?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Highlights this row regardless of selection — used for "happening now" in Trip Mode. */
  activeIndex?: number;
}) {
  return (
    <div className="space-y-0">
      {activities.map((act, i) => {
        const place = act.placeId ? places[act.placeId] : null;
        const isLast = i === activities.length - 1;
        const next = activities[i + 1];
        const nextPlace = next?.placeId ? places[next.placeId] : null;

        return (
          <div key={act.id} className="flex gap-3">
            <div className="flex w-6 shrink-0 flex-col items-center pt-1">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold text-white ${
                  i === activeIndex ? "bg-[var(--color-primary)]" : "bg-[var(--color-teal)]"
                }`}
              >
                {i + 1}
              </span>
              {!isLast && (
                <div
                  className="my-1 w-[3px] flex-1 rounded-full bg-[var(--color-teal)] opacity-40"
                  style={{ minHeight: 24 }}
                />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <ActivityCard
                activity={act}
                place={place}
                selected={i === activeIndex || (act.placeId != null && act.placeId === selectedId)}
                onClick={act.placeId && onSelect ? () => onSelect(act.placeId as string) : undefined}
                detailsHref={place && tripId ? `/trips/${tripId}/places/${place.id}` : undefined}
              />

              {!isLast && next && (
                <TravelConnector
                  minutes={next.travelFromPrevMinutes}
                  transport={transport}
                  from={place}
                  to={nextPlace}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TravelConnector({
  minutes,
  transport,
  from,
  to,
}: {
  minutes: number;
  transport?: TransportMode;
  from?: Place | null;
  to?: Place | null;
}) {
  if (minutes <= 0) return null;
  const mode = directionsMode(transport, minutes);
  const Icon = mode.icon;
  const directionsUrl =
    from && to
      ? `https://www.google.com/maps/dir/?api=1&origin=${from.coordinates.lat},${from.coordinates.lng}&destination=${to.coordinates.lat},${to.coordinates.lng}&travelmode=${mode.travelmode}`
      : null;

  return (
    <div className="my-2 flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-sand)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
        <Icon size={12} /> {mode.label} · ~{minutes} min
      </span>
      {directionsUrl && (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center text-xs font-semibold text-[var(--color-primary)] underline decoration-[var(--color-primary-soft)] underline-offset-2"
        >
          Get directions <ChevronRight size={13} />
        </a>
      )}
    </div>
  );
}
