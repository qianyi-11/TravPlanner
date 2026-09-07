"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { Badge } from "@/components/ui/Card";

export default function GroupSuggestionsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const places = usePlannerStore(
    useShallow((s) =>
      trip
        ? [...trip.placeIds.map((id) => s.places[id]).filter(Boolean)].sort(
            (a, b) => b.suggestedBy.length - a.suggestedBy.length
          )
        : []
    )
  );
  const members = usePlannerStore((s) => s.members);

  if (!trip) notFound();

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Everyone&apos;s Ideas</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {places.length} places suggested across your group.
          </p>
        </div>
        <LinkButton href={`/trips/${tripId}/places`} variant="outline" size="sm">
          Add yours
        </LinkButton>
      </div>

      <div className="mt-5 space-y-3">
        {places.length === 0 ? (
          <EmptyState icon={Sparkles} title="No ideas yet" description="Be the first to suggest a place." />
        ) : (
          places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              detailsHref={`/trips/${tripId}/places/${place.id}`}
              suggestedByMembers={place.suggestedBy.map((id) => members[id]).filter(Boolean)}
              topRight={
                place.suggestedBy.length > 1 ? (
                  <Badge tone="primary">{place.suggestedBy.length}× suggested</Badge>
                ) : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
