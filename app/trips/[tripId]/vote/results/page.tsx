"use client";

import { use, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { Check, Clock, Info, Trophy } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MemberStack } from "@/components/ui/Avatar";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { DemoVotingShortcut } from "@/components/trip/DemoVotingShortcut";
import { recommendPlaceCount } from "@/lib/utils";

export default function VoteResultsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const members = usePlannerStore((s) => s.members);
  const tripMembers = usePlannerStore(
    useShallow((s) =>
      s.trips[tripId] ? s.trips[tripId].memberIds.map((id) => s.members[id]).filter(Boolean) : []
    )
  );
  const places = usePlannerStore(
    useShallow((s) =>
      trip
        ? [...trip.placeIds.map((id) => s.places[id]).filter(Boolean)].sort((a, b) => b.voteCount - a.voteCount)
        : []
    )
  );
  const confirmShortlist = usePlannerStore((s) => s.confirmShortlist);

  const rec = trip ? recommendPlaceCount(trip) : { count: 8, reasoning: "" };
  const [count, setCount] = useState(trip?.recommendedPlaceCount || rec.count);

  if (!trip) notFound();

  // The group can't lock a shortlist until every traveler has had their say.
  const pending = tripMembers.filter((m) => !m.hasSubmittedVotes);
  const votedCount = tripMembers.length - pending.length;
  const everyoneVoted = pending.length === 0;

  function handleConfirm() {
    if (!everyoneVoted) return;
    const topIds = places.slice(0, count).map((p) => p.id);
    confirmShortlist(tripId, topIds);
    router.push(`/trips/${tripId}/shortlist`);
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="font-display text-2xl font-bold">Voting results</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Ranked by votes from your group.</p>

          <div className="mt-5 space-y-2.5">
            {places.map((place, i) => (
              <div key={place.id} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)]">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                    i === 0
                      ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                      : i < count
                      ? "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]"
                      : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]"
                  }`}
                >
                  {i === 0 ? <Trophy size={16} /> : `#${i + 1}`}
                </div>
                <PlaceCover photo={place.photo} category={place.category} className="h-12 w-12 shrink-0 rounded-xl" iconSize={16} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{place.name}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {place.category} · {place.area}
                  </p>
                </div>
                <MemberStack members={place.votedBy.map((id) => members[id]).filter(Boolean)} max={3} size="xs" />
                <span className="w-16 shrink-0 text-right text-sm font-bold">{place.voteCount} votes</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold">Votes in</h3>
            <span className="text-sm font-semibold tabular-nums">
              {votedCount} / {tripMembers.length}
            </span>
          </div>
          <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-sand)]">
            <div
              className="h-full rounded-full bg-[var(--color-teal)] transition-all"
              style={{ width: `${tripMembers.length ? (votedCount / tripMembers.length) * 100 : 0}%` }}
            />
          </div>
          <div className="space-y-2.5">
            {tripMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <MemberStack members={[m]} max={1} size="xs" />
                <span className="flex-1 truncate text-sm font-medium">{m.name}</span>
                {m.hasSubmittedVotes ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-[var(--color-teal)]">
                    <Check size={13} /> Voted
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-ink-soft)]">
                    <Clock size={12} /> Waiting
                  </span>
                )}
              </div>
            ))}
          </div>
          {!everyoneVoted && (
            <p className="mt-4 rounded-xl bg-[var(--color-warning-bg)] px-3 py-2.5 text-xs text-[var(--color-warning)]">
              Everyone needs to vote before the group can lock in the shortlist —
              still waiting on {pending.map((m) => m.name).join(", ")}.
            </p>
          )}
        </Card>

        <DemoVotingShortcut tripId={tripId} />

        <Card className="h-fit p-5">
          <div className="mb-3 flex items-center gap-2">
            <Info size={16} className="text-[var(--color-primary)]" />
            <h3 className="font-display text-base font-bold">How many places?</h3>
          </div>
          <p className="text-sm text-[var(--color-ink-soft)]">{rec.reasoning}</p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm font-semibold">
              <span>Places to shortlist</span>
              <span className="text-[var(--color-primary)]">{count}</span>
            </div>
            <input
              type="range"
              min={4}
              max={Math.min(20, places.length || 20)}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </div>

          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            Top {count} of {places.length} suggested places will move forward.
          </p>

          <Button
            fullWidth
            className="mt-5"
            onClick={handleConfirm}
            disabled={places.length === 0 || !everyoneVoted}
          >
            {everyoneVoted ? "Confirm & Continue" : `Waiting for ${pending.length} to vote`}
          </Button>
        </Card>
        </div>
      </div>
    </div>
  );
}
