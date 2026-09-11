"use client";

import { use } from "react";
import { notFound, useRouter } from "next/navigation";
import { Check, Vote as VoteIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { DemoVotingShortcut } from "@/components/trip/DemoVotingShortcut";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";

export default function VotePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const me = usePlannerStore((s) => s.members[s.currentUserId]);
  const members = usePlannerStore((s) => s.members);
  const places = usePlannerStore(
    useShallow((s) =>
      trip
        ? [...trip.placeIds.map((id) => s.tripPlaces[tripId]?.[id]).filter(Boolean)].sort((a, b) => b.voteCount - a.voteCount)
        : []
    )
  );
  const toggleVote = usePlannerStore((s) => s.toggleVote);
  const submitVotes = usePlannerStore((s) => s.submitMyVotes);

  if (!trip || !me) notFound();

  const myVotes = (me.votedPlaceIds ?? []).filter((id) => trip.placeIds.includes(id));
  const limit = trip.votesPerMember;

  function handleSubmit() {
    submitVotes(tripId);
    router.push(`/trips/${tripId}/vote/results`);
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6">
        <h1 className="font-display text-2xl font-bold">Where should we go?</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Vote for the places your group wants to visit.</p>

        <div className="sticky top-[70px] z-20 mt-5 flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white/95 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Choose up to {limit} places</p>
            <p className="font-display text-lg font-bold">
              {myVotes.length} <span className="text-sm font-medium text-[var(--color-ink-soft)]">/ {limit} votes used</span>
            </p>
          </div>
          <Button onClick={handleSubmit} disabled={myVotes.length === 0} icon={<VoteIcon size={15} />}>
            Submit Votes
          </Button>
        </div>

        <div className="mt-5">
          <DemoVotingShortcut tripId={tripId} />
        </div>

        <div className="mt-5 space-y-3">
          {places.map((place) => {
            const voted = myVotes.includes(place.id);
            const suggesters = place.suggestedBy.map((id) => members[id]).filter(Boolean);
            return (
              <PlaceCard
                key={place.id}
                place={place}
                detailsHref={`/trips/${tripId}/places/${place.id}`}
                suggestedByMembers={suggesters}
                topRight={<Badge tone="teal">{place.voteCount} votes</Badge>}
                footer={
                  <Button
                    size="sm"
                    variant={voted ? "secondary" : "outline"}
                    icon={voted ? <Check size={14} /> : <VoteIcon size={14} />}
                    onClick={() => toggleVote(tripId, place.id)}
                  >
                    {voted ? "Voted" : "Vote"}
                  </Button>
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
