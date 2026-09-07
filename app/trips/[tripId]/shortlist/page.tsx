"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { Trophy } from "lucide-react";

export default function ShortlistPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const members = usePlannerStore((s) => s.members);
  const places = usePlannerStore(
    useShallow((s) =>
      trip ? trip.shortlistPlaceIds.map((id) => s.places[id]).filter(Boolean) : []
    )
  );

  if (!trip) notFound();

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Your Group&apos;s Top Choices</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{places.length} places made the shortlist.</p>
        </div>
        <LinkButton href={`/trips/${tripId}/validate`} iconRight={<ArrowRight size={15} />}>
          Continue to Validation
        </LinkButton>
      </div>

      <div className="mt-5 space-y-3">
        {places.length === 0 ? (
          <EmptyState icon={Trophy} title="No shortlist yet" description="Finish voting to build your shortlist." />
        ) : (
          places.map((place, i) => (
            <PlaceCard
              key={place.id}
              place={place}
              rank={i + 1}
              detailsHref={`/trips/${tripId}/places/${place.id}`}
              suggestedByMembers={place.suggestedBy.map((id) => members[id]).filter(Boolean)}
              topRight={<Badge tone="teal">{place.voteCount} votes</Badge>}
            />
          ))
        )}
      </div>
    </div>
  );
}
