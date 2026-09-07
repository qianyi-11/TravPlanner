"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/use-auth";
import { submitCandidate } from "@/lib/api/candidates";
import { useCandidates } from "@/lib/hooks/use-candidates";
import { useSubmissions } from "@/lib/hooks/use-submissions";
import { useTrip } from "@/lib/hooks/use-trip";
import type { PreferredPeriod, SubmissionPreference } from "@travel-planner/shared";

const periods: PreferredPeriod[] = ["ANYTIME", "MORNING", "AFTERNOON", "EVENING"];
const preferences: SubmissionPreference[] = ["INTERESTED", "MUST_DO"];

export default function PlacesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const mineOnly = useSearchParams().get("mine") === "1";
  const { user } = useAuth();
  const trip = useTrip(tripId);
  const candidates = useCandidates(tripId);
  const submissions = useSubmissions(tripId);
  const [placeId, setPlaceId] = useState("");
  const [preference, setPreference] = useState<SubmissionPreference>("INTERESTED");
  const [preferredPeriod, setPreferredPeriod] = useState<PreferredPeriod>("ANYTIME");
  const [duration, setDuration] = useState("90");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trip.data || !placeId.trim() || !user) return setError("Add a valid provider Place ID first.");
    setPending(true); setError(null);
    try { await submitCandidate({ tripId, expectedPlanningCycle: trip.data.planningCycle, placeId: placeId.trim(), preference, preferredPeriod, estimatedDurationMinutes: Number(duration), durationSource: "USER_OVERRIDE", notes: notes.trim() || undefined }); setPlaceId(""); setNotes(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Candidate submission failed."); }
    finally { setPending(false); }
  }

  if (trip.loading || candidates.loading || submissions.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading candidates…</p>;
  if (trip.error || candidates.error || submissions.error) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || candidates.error?.message || submissions.error?.message}</p>;
  if (!trip.data) return <p className="py-20 text-center text-sm">Trip not found.</p>;
  const mySubmissions = new Map((submissions.data ?? []).filter((submission) => submission.memberId === user?.uid).map((submission) => [submission.candidateId, submission]));
  const visible = (candidates.data ?? []).filter((candidate) => !mineOnly || mySubmissions.has(candidate.id));
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{trip.data.name}</p><h1 className="mt-2 font-display text-3xl font-extrabold">{mineOnly ? "My places" : "Places"}</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Submit real places for the group to consider.</p></div><Card className="p-6"><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-semibold">Google Place ID<input value={placeId} onChange={(event) => setPlaceId(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="ChIJ…" /></label><div className="grid gap-4 sm:grid-cols-3"><label className="block text-sm font-semibold">Preference<select value={preference} onChange={(event) => setPreference(event.target.value as SubmissionPreference)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm">{preferences.map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold">Preferred period<select value={preferredPeriod} onChange={(event) => setPreferredPeriod(event.target.value as PreferredPeriod)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm">{periods.map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold">Duration (minutes)<input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm" /></label></div><label className="block text-sm font-semibold">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="Optional context" /></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" disabled={pending || trip.data.phase !== "COLLECTING"}>{pending ? "Submitting…" : trip.data.phase === "COLLECTING" ? "Submit place" : "Submissions are closed"}</Button></form></Card><section><h2 className="mb-4 font-display text-xl font-bold">{visible.length} candidate{visible.length === 1 ? "" : "s"}</h2><div className="grid gap-4 sm:grid-cols-2">{visible.map((candidate) => { const submission = mySubmissions.get(candidate.id); return <article key={candidate.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-5"><h3 className="font-display text-lg font-bold">{candidate.name}</h3><p className="mt-1 text-sm text-[var(--color-ink-soft)]">{candidate.formattedAddress || "Address unavailable"}</p><p className="mt-3 text-xs text-[var(--color-ink-soft)]">{candidate.location.lat.toFixed(4)}, {candidate.location.lng.toFixed(4)}</p>{submission && <p className="mt-4 text-xs font-semibold">Your submission: {submission.preference} · {submission.preferredPeriod} · {submission.estimatedDurationMinutes} min</p>}</article>; })}</div>{visible.length === 0 && <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-soft)]">No candidates yet.</p>}</section></div>;
}
