"use client";

import { use, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { applyMinorEdit, finalizeTrip, submitApproval } from "@/lib/api/review";
import { useAuth } from "@/lib/auth/use-auth";
import { useApprovals } from "@/lib/hooks/use-approvals";
import { useFinalItinerary } from "@/lib/hooks/use-final-itinerary";
import { useReview } from "@/lib/hooks/use-review";
import { useTrip } from "@/lib/hooks/use-trip";
import type { ItineraryDay } from "@travel-planner/shared";

export default function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const trip = useTrip(tripId);
  const review = useReview(tripId, trip.data?.planningCycle);
  const approvals = useApprovals(tripId);
  const finalItinerary = useFinalItinerary(tripId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setPending(true);
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : fallback); } finally { setPending(false); }
  }

  if (trip.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading itinerary…</p>;
  if (trip.error || !trip.data) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || "Trip not found."}</p>;

  const currentTrip = trip.data;
  const isOwner = user?.uid === currentTrip.ownerId;
  const approval = approvals.data?.find(item => item.type === "FINAL_ITINERARY" && item.subjectType === "REVIEW_DRAFT" && item.planningCycle === currentTrip.planningCycle && item.subjectId === String(currentTrip.planningCycle) && item.status !== "STALE");

  if (currentTrip.phase === "FINALIZED") {
    return <ItineraryView title="Final itinerary" days={finalItinerary.data?.days ?? []} loading={finalItinerary.loading} error={finalItinerary.error?.message} />;
  }

  const draft = review.data;
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{currentTrip.name}</p><h1 className="mt-2 font-display text-3xl font-extrabold">Review itinerary</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Review draft revision {draft?.revision ?? "—"}. Backend validation and approval state control finalization.</p></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{currentTrip.phase !== "REVIEW" && <Card className="p-6"><p className="text-sm">The trip is currently {currentTrip.phase}. Review actions are unavailable.</p></Card>}{currentTrip.phase === "REVIEW" && !draft && <Card className="p-6"><p className="text-sm">Waiting for the current review draft…</p></Card>}{draft && <><div className="space-y-3"><ItineraryDays days={draft.days} canEdit={isOwner} pending={pending} onEdit={(itemId, durationMinutes) => run(() => applyMinorEdit({ tripId, expectedPlanningCycle: currentTrip.planningCycle, expectedReviewDraftRevision: draft.revision, edit: { type: "CHANGE_DURATION", itemId, durationMinutes } }), "Minor edit failed.")} /></div>{approval && <Card className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Group approval</p><p className="text-sm text-[var(--color-ink-soft)]">{approval.yesCount} approve · {approval.noCount} reject · {approval.status}</p></div><div className="flex gap-2"><Button variant="outline" disabled={pending} onClick={() => run(() => submitApproval({ tripId, approvalId: approval.id, decision: "REJECT" }), "Approval update failed.")}>Reject</Button><Button disabled={pending} onClick={() => run(() => submitApproval({ tripId, approvalId: approval.id, decision: "APPROVE" }), "Approval update failed.")}>Approve</Button></div></div></Card>}{isOwner && <Card className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-semibold">Finalize itinerary</p><p className="text-sm text-[var(--color-ink-soft)]">The backend will reject this until validation and required approvals pass.</p></div><Button disabled={pending || !draft} onClick={() => run(() => finalizeTrip({ tripId, expectedPlanningCycle: currentTrip.planningCycle, expectedReviewDraftRevision: draft.revision }), "Finalization failed.")}>{pending ? "Working…" : "Finalize trip"}</Button></Card>}</>}</div>;
}

function ItineraryDays({ days, canEdit, pending, onEdit }: { days: ItineraryDay[]; canEdit: boolean; pending: boolean; onEdit: (itemId: string, durationMinutes: number) => Promise<void> }) {
  return <div className="space-y-4">{days.map(day => <Card key={day.date} className="p-5"><p className="text-sm font-semibold">{day.date}</p><div className="mt-4 space-y-3">{day.items.map(item => <ReviewItem key={item.itemId} item={item} canEdit={canEdit} pending={pending} onEdit={onEdit} />)}</div></Card>)}</div>;
}

function ReviewItem({ item, canEdit, pending, onEdit }: { item: ItineraryDay["items"][number]; canEdit: boolean; pending: boolean; onEdit: (itemId: string, durationMinutes: number) => Promise<void> }) {
  const [duration, setDuration] = useState(String(item.durationMinutes));
  return <div className="rounded-xl border border-[var(--color-border-soft)] p-3"><p className="text-sm font-semibold">{item.startTime}–{item.endTime} · {item.title}</p>{item.location && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{item.location.name}</p>}{canEdit && <div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs text-[var(--color-ink-soft)]" htmlFor={`duration-${item.itemId}`}>Minutes</label><input id={`duration-${item.itemId}`} className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm" min="1" type="number" value={duration} onChange={event => setDuration(event.target.value)} /><Button variant="outline" disabled={pending || !item.candidateId} onClick={() => onEdit(item.itemId, Number(duration))}>Save duration</Button></div>}</div>;
}

function ItineraryView({ title, days, loading, error }: { title: string; days: ItineraryDay[]; loading: boolean; error?: string }) {
  return <div className="space-y-6"><div><h1 className="font-display text-3xl font-extrabold">{title}</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Authoritative itinerary data from Firestore.</p></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{loading && <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm">Loading itinerary…</p>}{!loading && days.length === 0 && <Card className="p-6"><p className="text-sm">No itinerary days are available.</p></Card>}{days.map(day => <Card key={day.date} className="p-5"><p className="text-sm font-semibold">{day.date}</p><div className="mt-4 space-y-3">{day.items.map(item => <div key={item.itemId} className="rounded-xl border border-[var(--color-border-soft)] p-3"><p className="text-sm font-semibold">{item.startTime}–{item.endTime} · {item.title}</p>{item.location && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{item.location.name}</p>}</div>)}</div></Card>)}</div>;
}
