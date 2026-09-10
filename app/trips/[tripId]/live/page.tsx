"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Radio,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { ItineraryTimeline } from "@/components/trip/ItineraryTimeline";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatWeekday } from "@/lib/utils";
import { evaluateRescueConsensusImpact } from "@/lib/group-consensus";

type RescuePhase = "alert" | "searching" | "proposed" | "resolved";

export default function TripModePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const placesMap = usePlannerStore((s) => s.places);
  const membersMap = usePlannerStore((s) => s.members);
  const resolveRescue = usePlannerStore((s) => s.resolveRescue);
  const showToast = usePlannerStore((s) => s.showToast);

  const openEvent = trip?.rescueEvents.find((e) => e.status === "open");
  const [phase, setPhase] = useState<RescuePhase>("alert");
  const [saving, setSaving] = useState(false);

  const dayIndex = useMemo(() => {
    if (!trip) return 0;
    if (!openEvent) return 2;
    return trip.itinerary.findIndex((d) => d.activities.some((a) => a.id === openEvent.affectedActivityId));
  }, [trip, openEvent]);

  useEffect(() => {
    if (!openEvent) return;
    const t1 = setTimeout(() => setPhase("searching"), 1600);
    const t2 = setTimeout(() => setPhase("proposed"), 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed only on the event id, not the recomputed object
  }, [openEvent?.id]);

  if (!trip) notFound();

  const day = trip.itinerary[Math.max(0, dayIndex)];
  const currentActivityIdx = openEvent
    ? day?.activities.findIndex((a) => a.id === openEvent.affectedActivityId)
    : 1;
  const currentActivity = day?.activities[Math.max(0, currentActivityIdx ?? 1)];
  const nextActivity = day?.activities[Math.max(0, currentActivityIdx ?? 1) + 1];
  const remaining = day ? day.activities.length - Math.max(0, currentActivityIdx ?? 1) - 1 : 0;
  const originalPlace = currentActivity?.placeId ? placesMap[currentActivity.placeId] : undefined;
  const replacementPlace = openEvent?.alternative ? placesMap[openEvent.alternative.placeId] : undefined;
  const rescueImpact = originalPlace && replacementPlace
    ? evaluateRescueConsensusImpact({
        members: trip.memberIds.map((id) => membersMap[id]).filter(Boolean),
        original: originalPlace,
        replacement: replacementPlace,
      })
    : undefined;

  async function handleAccept() {
    if (!openEvent || saving) return;
    setSaving(true);
    try {
      if (await resolveRescue(tripId, openEvent.id)) {
        setPhase("resolved");
        showToast("Trip itinerary updated for everyone.");
      }
    } finally {
      setSaving(false);
    }
  }

  const isResolved = phase === "resolved" || trip.rescueEvents.some((event) => event.status === "resolved");

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8" style={{ background: trip.coverColor }}>
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-400" />
          <span className="text-xs font-bold uppercase tracking-wide text-white/80">Trip Mode · Live</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{trip.name}</h1>
        {day && (
          <p className="mt-1 text-sm text-white/80">
            Day {day.day} · {formatWeekday(day.date)} · {day.title}
          </p>
        )}
      </div>

      {openEvent && phase !== "resolved" && (
        <Card className="mt-6 overflow-hidden border-[var(--color-danger)]">
          <div className="flex items-start gap-3 bg-[var(--color-danger-bg)] p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
            <div>
              <p className="text-sm font-bold text-[var(--color-danger)]">Trip Rescue</p>
              <p className="mt-0.5 text-sm text-[var(--color-ink)]">{openEvent.message}</p>
            </div>
          </div>

          <div className="p-4">
            {phase === "alert" && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
                <Loader2 size={14} className="animate-spin" /> Assessing impact on your itinerary…
              </div>
            )}
            {phase === "searching" && (
              <div className="space-y-2 text-sm text-[var(--color-ink-soft)]">
                <p className="flex items-center gap-2 font-medium text-[var(--color-ink)]">
                  <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" /> Finding alternatives…
                </p>
                <ul className="ml-6 list-disc space-y-1 text-xs">
                  <li>Revalidating route</li>
                  <li>Checking price &amp; availability</li>
                  <li>Rechecking opening hours</li>
                </ul>
              </div>
            )}
            {phase === "proposed" && openEvent.alternative && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Recommended Alternative
                </p>
                <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3">
                  <PlaceCover
                    photo={placesMap[openEvent.alternative.placeId]?.photo ?? "linear-gradient(135deg,#ccc,#999)"}
                    category={placesMap[openEvent.alternative.placeId]?.category ?? "Place"}
                    className="h-14 w-14 shrink-0 rounded-xl"
                    iconSize={18}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{openEvent.alternative.label}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-ink-soft)]">
                      <span>+{openEvent.alternative.extraTravelMinutes} min travel</span>
                      <span className="text-[var(--color-success)]">
                        {openEvent.alternative.available ? "Available" : "Unavailable"}
                      </span>
                      <span>+RM {openEvent.alternative.cost}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-teal-dark)]">
                  <Sparkles size={12} /> {openEvent.alternative.note}
                </p>
                {rescueImpact && (
                  <div className="mt-3 rounded-xl bg-[var(--color-sand)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Group Match</p>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
                      <div><span className="block text-xs text-[var(--color-ink-soft)]">Original</span><strong>{rescueImpact.original.groupMatchPercent}%</strong></div>
                      <div><span className="block text-xs text-[var(--color-ink-soft)]">Replacement</span><strong>{rescueImpact.replacement.groupMatchPercent}%</strong></div>
                      <div>
                        <span className="block text-xs text-[var(--color-ink-soft)]">Change</span>
                        <strong>{rescueImpact.change > 0 ? "+" : ""}{rescueImpact.change} pts</strong>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                      Conflicts: {rescueImpact.replacement.dislikeConflictCount || "None"} · {rescueImpact.reason}
                    </p>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={handleAccept} disabled={saving} icon={<CheckCircle2 size={14} />}>
                    {saving ? "Saving…" : "Accept Change"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {isResolved && (
        <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-[var(--color-teal)] bg-[var(--color-teal-soft)] p-4">
          <CheckCircle2 size={16} className="text-[var(--color-teal-dark)]" />
          <p className="text-sm font-medium text-[var(--color-teal-dark)]">
            You accepted the new activity. Trip itinerary updated for everyone.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
            <Radio size={12} /> Current activity
          </p>
          <p className="mt-1 font-display text-base font-bold">
            {currentActivity ? (currentActivity.placeId ? placesMap[currentActivity.placeId]?.name : currentActivity.label) : "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
            <ArrowRight size={12} /> Next up
          </p>
          <p className="mt-1 font-display text-base font-bold">
            {nextActivity ? (nextActivity.placeId ? placesMap[nextActivity.placeId]?.name : nextActivity.label) : "—"}
          </p>
          {nextActivity && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
              {nextActivity.time} · {nextActivity.travelFromPrevMinutes} min travel
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
            <Clock size={12} /> Remaining today
          </p>
          <p className="mt-1 font-display text-base font-bold">{Math.max(0, remaining)} activities</p>
        </Card>
      </div>

      <Link
        href={`/trips/${tripId}/split-bill`}
        className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-card)]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
          <Receipt size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold">Split a bill</p>
          <p className="text-xs text-[var(--color-ink-soft)]">Just paid for a meal or a ride? Break down who owes what.</p>
        </div>
        <ArrowRight size={16} className="shrink-0 text-[var(--color-ink-soft)]" />
      </Link>

      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold">Today&apos;s itinerary</h2>
        <div className="space-y-2.5">
          {day && (
            <ItineraryTimeline
              activities={day.activities}
              places={placesMap}
              transport={trip?.transport}
              tripId={tripId}
              activeIndex={currentActivityIdx ?? undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
