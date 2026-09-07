"use client";

import { useShallow } from "zustand/react/shallow";
import { Plus } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { TripCard } from "@/components/trip/TripCard";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { Compass } from "lucide-react";

export default function MyTripsPage() {
  const trips = usePlannerStore(useShallow((s) => Object.values(s.trips)));
  const live = trips.filter((t) => t.isLive);
  const planning = trips.filter((t) => !t.isLive);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">My Trips</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Every trip you&apos;re planning or currently on.</p>
        </div>
        <LinkButton href="/groups" icon={<Plus size={16} />}>
          New Trip
        </LinkButton>
      </div>

      {trips.length === 0 ? (
        <EmptyState icon={Compass} title="No trips yet" description="Create a group to start planning your first trip." />
      ) : (
        <div className="space-y-10">
          {live.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-lg font-bold">Live now</h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {live.map((t) => (
                  <TripCard key={t.id} trip={t} />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-4 font-display text-lg font-bold">Planning</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {planning.map((t) => (
                <TripCard key={t.id} trip={t} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
