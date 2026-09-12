"use client";

import { use, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { Info, Trophy } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MemberStack } from "@/components/ui/Avatar";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { buildConsensus } from "@/lib/group-consensus";
import { recommendShortlistCapacity } from "@/lib/shortlist-capacity";

export default function VoteResultsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const members = usePlannerStore((s) => s.members);
  const places = usePlannerStore(
    useShallow((s) =>
      trip
        ? [...trip.placeIds.map((id) => s.tripPlaces[tripId]?.[id] ?? s.places[id]).filter(Boolean)].sort((a, b) => b.voteCount - a.voteCount)
        : []
    )
  );
  const confirmShortlist = usePlannerStore((s) => s.confirmShortlist);
  const [submitting, setSubmitting] = useState(false);

  const rec = trip ? recommendShortlistCapacity({ trip, candidates: places }) : null;
  const maxCount = Math.max(1, Math.min(20, places.length || 20));
  const [count, setCount] = useState(Math.max(1, Math.min(maxCount, rec?.recommendedCapacity ?? 8)));
  const tripMembers = trip ? trip.memberIds.map((id) => members[id]).filter(Boolean) : [];
  const consensus = buildConsensus({ members: tripMembers, candidates: places, capacity: count });
  const primaryTradeoff = [...consensus.tradeoffs].sort((a, b) =>
    (b.representedAfterCount - b.representedBeforeCount) - (a.representedAfterCount - a.representedBeforeCount) ||
    b.newlyRepresentedMemberIds.length - a.newlyRepresentedMemberIds.length ||
    a.selectionIndex - b.selectionIndex ||
    a.selectedCandidateId.localeCompare(b.selectedCandidateId)
  )[0];
  const fairPlace = primaryTradeoff && places.find((place) => place.id === primaryTradeoff.selectedCandidateId);
  const baselinePlace = primaryTradeoff && places.find((place) => place.id === primaryTradeoff.baselineCandidateId);
  const selectedById = new Map(consensus.shortlist.map((item) => [item.candidateId, item]));
  const fairSelection = fairPlace ? selectedById.get(fairPlace.id) : undefined;
  const selectedIds = new Set(selectedById.keys());
  const selectedPlaces = consensus.shortlist
    .map((item) => places.find((place) => place.id === item.candidateId))
    .filter((place): place is (typeof places)[number] => Boolean(place));
  const unselectedPlaces = consensus.candidateOrder
    .filter((id) => !selectedIds.has(id))
    .map((id) => places.find((place) => place.id === id))
    .filter((place): place is (typeof places)[number] => Boolean(place));

  if (!trip) notFound();

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (await confirmShortlist(tripId, count)) router.push(`/trips/${tripId}/shortlist`);
    } finally {
      setSubmitting(false);
    }
  }

  function resultRow(place: (typeof places)[number], index: number) {
    const result = consensus.candidates[place.id];
    const selected = selectedById.get(place.id);
    const mustDoNames = result.mustDoMemberIds.map((id) => members[id]?.name ?? id);

    return (
      <div key={place.id} className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)] sm:flex sm:items-center">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
            index === 0
              ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
              : selected
              ? "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]"
              : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]"
          }`}
        >
          {index === 0 ? <Trophy size={16} /> : `#${index + 1}`}
        </div>
        <PlaceCover photo={place.photo} category={place.category} className="h-12 w-12 shrink-0 rounded-xl" iconSize={16} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold">{place.name}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {place.category} · {place.area}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--color-ink-soft)]">
            <span className="font-semibold text-[var(--color-primary-dark)]">Preference signal {result.groupMatchPercent}%</span>
            <span>Base score {result.baseScore}</span>
            {selected && <span>Fair score {selected.fairScore}</span>}
            <span>{result.preferenceMatchCount}/{tripMembers.length} preference coverage</span>
            <span>{result.dislikeConflictCount ? `${result.dislikeConflictCount} preference conflict${result.dislikeConflictCount === 1 ? "" : "s"}` : "No conflicts"}</span>
          </div>
          {selected && <p className="mt-1 text-xs text-[var(--color-ink)]">{selected.reason}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {mustDoNames.length > 0 && (
              <span className="rounded-full bg-[var(--color-teal-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-teal-dark)]">
                Must-do · {mustDoNames.join(", ")}
              </span>
            )}
            {selected?.selectionReason === "REPRESENTATION" && (
              <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-primary-dark)]">
                Improves group representation
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 sm:hidden">
            <MemberStack members={place.votedBy.map((id) => members[id]).filter(Boolean)} max={3} size="xs" />
            <span className="text-right text-sm font-bold">{result.voteCount} votes</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <MemberStack members={place.votedBy.map((id) => members[id]).filter(Boolean)} max={3} size="xs" />
        </div>
        <span className="hidden w-16 shrink-0 text-right text-sm font-bold sm:block">{result.voteCount} votes</span>
      </div>
    );
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6">
        <h1 className="font-display text-2xl font-bold">Fair Group Consensus</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          See who the shortlist represents, why each place ranks, and when fairness changes a decision.
        </p>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="order-2 lg:order-1">

          {primaryTradeoff && fairPlace && baselinePlace && (
            <Card data-testid="consensus-tradeoff" className="mt-5 p-5">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-[var(--color-primary)]" />
                <h2 className="font-display text-base font-bold">
                  Consensus {consensus.tradeoffs.length === 1 ? "changed" : "adjusted"} {consensus.tradeoffs.length} shortlist decision{consensus.tradeoffs.length === 1 ? "" : "s"}
                </h2>
              </div>
              {consensus.tradeoffs.length > 1 && <p className="mt-2 text-xs font-semibold text-[var(--color-ink-soft)]">Most important trade-off</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--color-teal-dark)]">With group fairness</p>
                  <p className="break-words font-display font-bold">{fairPlace.name}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Without representation adjustment</p>
                  <p className="break-words font-display font-bold">{baselinePlace.name}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--color-ink-soft)]">
                <span>
                  Traveller coverage {primaryTradeoff.representedBeforeCount === primaryTradeoff.representedAfterCount
                    ? `${primaryTradeoff.representedAfterCount} / ${tripMembers.length}`
                    : `${primaryTradeoff.representedBeforeCount} / ${tripMembers.length} → ${primaryTradeoff.representedAfterCount} / ${tripMembers.length}`}
                </span>
                <span>Support {consensus.candidates[fairPlace.id].voteCount} votes vs {consensus.candidates[baselinePlace.id].voteCount} votes</span>
              </div>
              {fairSelection && (
                <div className="mt-3 grid gap-2 rounded-xl bg-[var(--color-sand)] p-3 text-xs text-[var(--color-ink-soft)] sm:grid-cols-2">
                  <span>Selected base score: <strong className="text-[var(--color-ink)]">{fairSelection.baseScore}</strong></span>
                  <span>Baseline base score: <strong className="text-[var(--color-ink)]">{consensus.candidates[baselinePlace.id].baseScore}</strong></span>
                  <span>Representation adjustment: <strong className="text-[var(--color-ink)]">+{fairSelection.representationBonus}</strong></span>
                  <span>Selected fair score: <strong className="text-[var(--color-ink)]">{fairSelection.fairScore}</strong></span>
                </div>
              )}
              <p className="mt-3 text-sm text-[var(--color-ink)]">{primaryTradeoff.explanation}</p>
              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                Base score = 2 × votes + preference matches − 2 × dislike conflicts. Group Match is a separate preference signal.
              </p>
            </Card>
          )}

          <div data-testid="consensus-selected" className="mt-5 space-y-2.5">
            <h2 className="font-display text-lg font-bold">Selected shortlist</h2>
            {selectedPlaces.map(resultRow)}
          </div>

          {unselectedPlaces.length > 0 && (
            <details data-testid="consensus-unselected" className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-sand)] p-4">
              <summary className="cursor-pointer font-display text-sm font-bold">
                View {unselectedPlaces.length} unselected option{unselectedPlaces.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-4 space-y-2.5">
                {unselectedPlaces.map((place, index) => resultRow(place, selectedPlaces.length + index))}
              </div>
            </details>
          )}
        </div>

        <Card data-testid="consensus-controls" className="order-1 h-fit p-5 lg:order-2 lg:sticky lg:top-24">
          <div className="mb-3 flex items-center gap-2">
            <Info size={16} className="text-[var(--color-primary)]" />
            <h2 className="font-display text-base font-bold">Choose shortlist size</h2>
          </div>
          <div className="space-y-1 text-sm text-[var(--color-ink-soft)]">
            {rec?.reasoning.map((reason) => <p key={reason}>{reason}</p>)}
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm font-semibold">
              <span>Places to shortlist</span>
              <span className="text-[var(--color-primary)]">{count}</span>
            </div>
            <input
              data-testid="shortlist-capacity"
              type="range"
              min={Math.min(4, maxCount)}
              max={maxCount}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </div>

          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            {consensus.shortlist.length} of {places.length} suggested places will move forward.
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--color-teal-dark)]">
            Represents {consensus.representedMemberCount} of {tripMembers.length} travellers.
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
            {places.length > 0 && consensus.shortlist.length === places.length
              ? "Every suggestion fits. Choose a tighter shortlist to compare the trade-offs."
              : consensus.tradeoffs.length
              ? `Fairness changed ${consensus.tradeoffs.length} shortlist decision${consensus.tradeoffs.length === 1 ? "" : "s"}.`
              : "No representation adjustment changes the shortlist at this size."}
          </p>

          <Button data-testid="confirm-shortlist" fullWidth className="mt-5" onClick={handleConfirm} disabled={places.length === 0 || submitting}>
            {submitting ? "Saving…" : "Confirm & Continue"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
