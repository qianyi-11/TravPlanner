"use client";

import { use, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Compass,
  Lightbulb,
  ListChecks,
  MapPinned,
  Route as RouteIcon,
  Sparkles,
  Trash2,
  Vote,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { Card, Badge } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { MemberAvatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { daysBetween, formatCurrency, pressureTone } from "@/lib/utils";
import type { PlanningStage } from "@/lib/types";

const STAGE_INFO: Record<
  PlanningStage,
  { icon: typeof Lightbulb; title: string; description: string; cta: string; href: string }
> = {
  ideas: {
    icon: Lightbulb,
    title: "Collect everyone's ideas",
    description: "Every member adds the places they'd love to visit. The more ideas, the better the vote.",
    cta: "Add Places",
    href: "places",
  },
  preferences: {
    icon: Sparkles,
    title: "Share your travel preferences",
    description: "Tell the group your interests, food preferences, pace, and budget.",
    cta: "Set Preferences",
    href: "preferences",
  },
  voting: {
    icon: Vote,
    title: "Vote for your favorites",
    description: "Everyone votes on the suggested places. The most popular ideas move forward.",
    cta: "Vote Now",
    href: "vote",
  },
  validation: {
    icon: ListChecks,
    title: "Review the shortlist",
    description: "Review saved ratings, opening hours, cost information and availability notes.",
    cta: "Review Places",
    href: "validate",
  },
  route: {
    icon: RouteIcon,
    title: "Preview the trip sequence",
    description: "Review the saved place order and area grouping on the map.",
    cta: "View Route",
    href: "route",
  },
  itinerary: {
    icon: MapPinned,
    title: "Your itinerary is ready",
    description: "A full day-by-day plan built from your group's choices.",
    cta: "View Itinerary",
    href: "itinerary",
  },
};

export default function TripWorkspacePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const members = usePlannerStore(
    useShallow((s) => (trip ? trip.memberIds.map((id) => s.members[id]).filter(Boolean) : []))
  );
  const places = usePlannerStore(
    useShallow((s) => (trip ? trip.placeIds.map((id) => s.places[id]).filter(Boolean) : []))
  );
  const deleteTrip = usePlannerStore((s) => s.deleteTrip);
  const showToast = usePlannerStore((s) => s.showToast);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!trip) notFound();

  const solo = members.length === 1;
  const info = solo && trip.stage === "voting"
    ? { ...STAGE_INFO.voting, title: "Build your shortlist", description: "Use your saved preferences and places to choose a deterministic shortlist.", cta: "Build Shortlist", href: "vote/results" }
    : STAGE_INFO[trip.stage];
  const days = daysBetween(trip.startDate, trip.endDate);
  const suggestedCount = places.length;
  const shortlistCount = trip.shortlistPlaceIds.length;
  const tone = pressureTone(trip.pricePressure.level);

  const suggestedDone = members.filter((m) => m.hasSubmittedSuggestions).length;
  const votedDone = members.filter((m) => m.hasSubmittedVotes).length;

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                <info.icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  What&apos;s next
                </p>
                <h2 className="mt-0.5 font-display text-lg font-bold">{info.title}</h2>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{info.description}</p>
                <LinkButton href={`/trips/${trip.id}/${info.href}`} className="mt-4" iconRight={<ArrowRight size={15} />}>
                  {info.cta}
                </LinkButton>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Duration" value={`${days} days`} />
            <StatCard label="Budget" value={formatCurrency(trip.budgetTotal)} />
            <StatCard label="Places suggested" value={String(suggestedCount)} />
            <StatCard label="Shortlisted" value={shortlistCount > 0 ? String(shortlistCount) : "—"} />
          </div>

          {trip.isLive && (
            <Card className="flex items-center justify-between gap-4 border-[var(--color-teal)] bg-[var(--color-teal-soft)] p-5">
              <div>
                <Badge tone="teal">Trip is live</Badge>
                <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
                  Your trip has started — switch to Trip Mode to follow the saved plan and handle Rescue events.
                </p>
              </div>
              <LinkButton href={`/trips/${trip.id}/live`} variant="secondary" size="sm">
                Open Trip Mode
              </LinkButton>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Booking pressure</h3>
              <LinkButton href={`/trips/${trip.id}/plan`} variant="ghost" size="sm">
                View plan
              </LinkButton>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ backgroundColor: tone.bg, color: tone.fg }}
              >
                {trip.pricePressure.level}
              </span>
              <p className="text-sm text-[var(--color-ink-soft)]">{trip.pricePressure.recommendation}</p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-fit p-5">
            <h3 className="mb-4 font-display text-base font-bold">{solo ? "Solo planning" : "Group status"}</h3>
            {solo ? (
              <p className="text-sm text-[var(--color-ink-soft)]">Your preferences and saved places will determine the shortlist and itinerary.</p>
            ) : (
              <>
                <div className="space-y-4 text-sm">
                  <StatusRow label="Suggestions submitted" done={suggestedDone} total={members.length} />
                  <StatusRow label="Votes submitted" done={votedDone} total={members.length} />
                </div>
                <div className="mt-5 space-y-3 border-t border-[var(--color-border-soft)] pt-4">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <MemberAvatar member={m} size="sm" />
                      <span className="flex-1 truncate text-sm font-medium">{m.name}</span>
                      {m.hasSubmittedVotes ? (
                        <CheckCircle2 size={16} className="text-[var(--color-teal)]" />
                      ) : m.hasSubmittedSuggestions ? (
                        <Circle size={16} className="text-[var(--color-warning)]" fill="var(--color-warning-bg)" />
                      ) : (
                        <Circle size={16} className="text-[var(--color-border)]" />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <LinkButton href={`/groups/${trip.groupId}`} variant="ghost" size="sm" fullWidth className="mt-4" icon={<Compass size={14} />}>
              Back to group room
            </LinkButton>
          </Card>

          <Card className="p-5">
            <h3 className="mb-1 font-display text-sm font-bold text-[var(--color-danger)]">Danger zone</h3>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
              Permanently delete this trip and everything in it. This can&apos;t be undone.
            </p>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              icon={<Trash2 size={14} />}
              className="border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
              onClick={() => setConfirmOpen(true)}
            >
              Delete Trip
            </Button>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete this trip?"
        description={`"${trip.name}" and everything in it — suggestions, votes, and the itinerary — will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete Trip"
        danger
        onConfirm={async () => {
          await deleteTrip(trip.id);
          showToast(`${trip.name} was deleted`);
          router.push(`/groups/${trip.groupId}`);
        }}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </Card>
  );
}

function StatusRow({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[var(--color-ink-soft)]">{label}</span>
        <span className="font-semibold">
          {done} / {total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-sand)]">
        <div className="h-full rounded-full bg-[var(--color-teal)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
