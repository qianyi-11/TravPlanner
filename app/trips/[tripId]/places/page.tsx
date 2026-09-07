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
import { useTripMembers } from "@/lib/hooks/use-trip-members";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { PlaceAutocomplete, type PlaceSelection } from "@/components/places/PlaceAutocomplete";
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
  const members = useTripMembers(tripId);
  const [place, setPlace] = useState<PlaceSelection | null>(null);
  const [preference, setPreference] = useState<SubmissionPreference>("INTERESTED");
  const [preferredPeriod, setPreferredPeriod] = useState<PreferredPeriod>("ANYTIME");
  const [duration, setDuration] = useState("90");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trip.data || !place?.placeId || !user) return setError("Search for a place and choose a result first.");
    setPending(true); setError(null);
    try { await submitCandidate({ tripId, expectedPlanningCycle: trip.data.planningCycle, placeId: place.placeId, preference, preferredPeriod, estimatedDurationMinutes: Number(duration), durationSource: "USER_OVERRIDE", notes: notes.trim() || undefined }); setPlace(null); setNotes(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Candidate submission failed."); }
    finally { setPending(false); }
  }

  if (trip.loading || candidates.loading || submissions.loading || members.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading candidates…</p>;
  if (trip.error || candidates.error || submissions.error || members.error) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || candidates.error?.message || submissions.error?.message || members.error?.message}</p>;
  if (!trip.data) return <p className="py-20 text-center text-sm">Trip not found.</p>;
  const mySubmissions = new Map((submissions.data ?? []).filter((submission) => submission.memberId === user?.uid).map((submission) => [submission.candidateId, submission]));
  const visible = (candidates.data ?? []).filter((candidate) => !mineOnly || mySubmissions.has(candidate.id));
  const role = members.data?.find((member) => member.uid === user?.uid)?.role;
  return <div><TripHeader trip={trip.data} memberCount={trip.data.activeMemberCount} role={role} /><div className="mt-6 space-y-6"><div><h1 className="font-display text-2xl font-bold">{mineOnly ? "My places" : "Where do you want to go?"}</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Submit real places for the group to consider.</p></div><Card className="p-6"><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-semibold">Place to suggest<PlaceAutocomplete label="Place to suggest" placeholder="Search for a place…" onChange={setPlace} /></label>{place && <p className="text-xs text-[var(--color-ink-soft)]">Selected: {place.formattedAddress || place.name}</p>}<div className="grid gap-4 sm:grid-cols-3"><label className="block text-sm font-semibold">Preference<select value={preference} onChange={(event) => setPreference(event.target.value as SubmissionPreference)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm">{preferences.map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold">Preferred period<select value={preferredPeriod} onChange={(event) => setPreferredPeriod(event.target.value as PreferredPeriod)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm">{periods.map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold">Duration (minutes)<input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm" /></label></div><label className="block text-sm font-semibold">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="Optional context" /></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" disabled={pending || trip.data.phase !== "COLLECTING"}>{pending ? "Submitting…" : trip.data.phase === "COLLECTING" ? "Submit place" : "Submissions are closed"}</Button></form></Card><section><h2 className="mb-4 font-display text-xl font-bold">{visible.length} candidate{visible.length === 1 ? "" : "s"}</h2><div className="grid gap-4 sm:grid-cols-2">{visible.map((candidate) => <PlaceCard key={candidate.id} candidate={candidate} submission={mySubmissions.get(candidate.id)} />)}</div>{visible.length === 0 && <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-soft)]">No candidates yet.</p>}</section></div></div>;
}
