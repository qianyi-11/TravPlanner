"use client";

import { use, useMemo } from "react";
import { notFound, useRouter } from "next/navigation";
import { Check, Clock, Info, Trophy, UtensilsCrossed } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MemberStack } from "@/components/ui/Avatar";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { DemoVotingShortcut } from "@/components/trip/DemoVotingShortcut";
import { planShortlist } from "@/lib/shortlist-planner";

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
        ? [...trip.placeIds.map((id) => s.tripPlaces[tripId]?.[id]).filter(Boolean)].sort((a, b) => b.voteCount - a.voteCount)
        : []
    )
  );
  const confirmShortlist = usePlannerStore((s) => s.confirmShortlist);

  // The system works out how many places the trip can actually hold, and which
  // of them are the meals — the group doesn't guess a number on a slider.
  const plan = useMemo(
    () => (trip ? planShortlist(trip, places) : null),
    [trip, places]
  );

  if (!trip || !plan) notFound();

  const chosen = new Set(plan.placeIds);
  const foodChosen = new Set(plan.foodIds);

  // The group can't lock a shortlist until every traveler has had their say.
  const pending = tripMembers.filter((m) => !m.hasSubmittedVotes);
  const votedCount = tripMembers.length - pending.length;
  const everyoneVoted = pending.length === 0;

  function handleConfirm() {
    if (!everyoneVoted || !plan) return;
    confirmShortlist(tripId, plan.placeIds);
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
            {places.map((place, i) => {
              const madeCut = chosen.has(place.id);
              const isMeal = foodChosen.has(place.id);
              return (
              <div
                key={place.id}
                className={`flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-[var(--shadow-soft)] ${
                  madeCut ? "border-[var(--color-border)]" : "border-dashed border-[var(--color-border)] opacity-60"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                    i === 0
                      ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                      : madeCut
                      ? "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]"
                      : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]"
                  }`}
                >
                  {i === 0 ? <Trophy size={16} /> : `#${i + 1}`}
                </div>
                <PlaceCover photo={place.photo} category={place.category} className="h-12 w-12 shrink-0 rounded-xl" iconSize={16} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-bold">{place.name}</p>
                    {isMeal && (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-primary-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary-dark)]">
                        <UtensilsCrossed size={9} /> MEAL
                      </span>
                    )}
                    {!madeCut && (
                      <span className="shrink-0 rounded-md bg-[var(--color-sand)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-ink-soft)]">
                        DIDN&apos;T FIT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {place.category} · {place.area}
                  </p>
                </div>
                <MemberStack members={place.votedBy.map((id) => members[id]).filter(Boolean)} max={3} size="xs" />
                <span className="w-16 shrink-0 text-right text-sm font-bold">{place.voteCount} votes</span>
              </div>
              );
            })}
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
            <h3 className="font-display text-base font-bold">What fits in this trip</h3>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-[var(--color-primary-soft)] p-3">
              <p className="font-display text-xl font-bold text-[var(--color-primary-dark)]">
                {plan.foodIds.length}
              </p>
              <p className="text-xs font-medium text-[var(--color-primary-dark)]">places to eat</p>
            </div>
            <div className="flex-1 rounded-xl bg-[var(--color-teal-soft)] p-3">
              <p className="font-display text-xl font-bold text-[var(--color-teal-dark)]">
                {plan.sightIds.length}
              </p>
              <p className="text-xs font-medium text-[var(--color-teal-dark)]">places to visit</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {plan.reasoning.map((line, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-ink-faint,var(--color-ink-soft))]" />
                {line}
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-[var(--color-border-soft)] pt-3 text-xs text-[var(--color-ink-soft)]">
            Your meals get assigned to the highest-voted places to eat when the itinerary is built.
          </p>

          <Button
            fullWidth
            className="mt-4"
            onClick={handleConfirm}
            disabled={places.length === 0 || !everyoneVoted}
          >
            {everyoneVoted ? `Confirm ${plan.placeIds.length} places` : `Waiting for ${pending.length} to vote`}
          </Button>
        </Card>
        </div>
      </div>
    </div>
  );
}
