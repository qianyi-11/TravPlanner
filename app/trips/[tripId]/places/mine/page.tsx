"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { PartyPopper, Trash2, Users2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

export default function MySuggestionsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const tripMemberProgress = usePlannerStore((s) => s.tripMemberProgress[tripId]);
  const me = usePlannerStore((s) => s.members[s.currentUserId]);
  const members = usePlannerStore(
    useShallow((s) => (trip ? trip.memberIds.map((id) => s.members[id]).filter(Boolean) : []))
  );
  const myPlaces = usePlannerStore(
    useShallow((s) =>
      trip
        ? trip.placeIds.map((id) => s.tripPlaces[tripId]?.[id] ?? s.places[id]).filter((p) => p?.suggestedBy.includes(currentUserId))
        : []
    )
  );
  const removeSuggestion = usePlannerStore((s) => s.removePlaceSuggestion);
  const submit = usePlannerStore((s) => s.submitMySuggestions);
  const [submitting, setSubmitting] = useState(false);

  if (!trip || !me) notFound();

  const submittedCount = members.filter((m) => tripMemberProgress?.[m.id]?.submittedSuggestions).length;
  const solo = members.length === 1;

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (await submit(tripId)) router.push(`/trips/${tripId}/preferences`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold">Your Suggestions</h1>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{myPlaces.length} places</p>
            </div>
            <LinkButton href={`/trips/${tripId}/places`} variant="outline" size="sm">
              Add more
            </LinkButton>
          </div>

          {myPlaces.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No suggestions yet"
              description="Search for places you'd love to visit and add them here."
              action={<LinkButton href={`/trips/${tripId}/places`}>Add Places</LinkButton>}
            />
          ) : (
            <div className="space-y-3">
              {myPlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  detailsHref={`/trips/${tripId}/places/${place.id}`}
                  footer={
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={13} />}
                        onClick={() => removeSuggestion(tripId, place.id)}
                        className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                      >
                        Remove
                      </Button>
                      <LinkButton href={`/trips/${tripId}/places/${place.id}`} size="sm" variant="outline">
                        View Details
                      </LinkButton>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit p-5">
          {tripMemberProgress?.[me.id]?.submittedSuggestions ? (
            <div className="text-center">
              <PartyPopper className="mx-auto text-[var(--color-primary)]" size={32} />
              <h3 className="mt-3 font-display text-lg font-bold">{solo ? "Ready to build your plan" : "You're all set 🎉"}</h3>
              {solo ? (
                <>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Your preferences and places will create a deterministic shortlist.</p>
                  <LinkButton href={`/trips/${tripId}/preferences`} size="sm" fullWidth className="mt-5">
                    Continue to Preferences
                  </LinkButton>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Waiting for the rest of your group.</p>
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
                      {submittedCount} / {members.length} members submitted
                    </p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-sand)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-teal)]"
                        style={{ width: `${(submittedCount / members.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
              {!solo && submittedCount === members.length ? (
                <LinkButton href={`/trips/${tripId}/generating`} size="sm" fullWidth className="mt-5">
                  Start Voting
                </LinkButton>
               ) : !solo ? (
                <LinkButton href={`/trips/${tripId}/places/all`} variant="outline" size="sm" fullWidth className="mt-5">
                  See Everyone&apos;s Ideas
                </LinkButton>
               ) : null}
            </div>
          ) : (
            <>
              <h3 className="font-display text-base font-bold">Ready to submit?</h3>
              <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
                You&apos;ve added <strong>{myPlaces.length} places</strong>. {solo ? "Submit them to build your shortlist." : "Your group can vote once everyone has submitted."}
              </p>
              <Button
                fullWidth
                className="mt-4"
                disabled={myPlaces.length === 0}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting…" : "Submit My Suggestions"}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
