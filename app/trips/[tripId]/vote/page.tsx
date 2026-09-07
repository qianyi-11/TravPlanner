"use client";

import { use, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { castCandidateVote, closeVoting, startVoting } from "@/lib/api/voting";
import { useAuth } from "@/lib/auth/use-auth";
import { useCandidates } from "@/lib/hooks/use-candidates";
import { useOwnCandidateVote } from "@/lib/hooks/use-own-candidate-vote";
import { useTrip } from "@/lib/hooks/use-trip";
import type { CandidateVoteValue } from "@travel-planner/shared";

const values: CandidateVoteValue[] = ["WANT", "NEUTRAL", "AVOID"];

export default function VotePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const trip = useTrip(tripId);
  const candidates = useCandidates(tripId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = trip.data?.ownerId === user?.uid;

  async function move(action: () => Promise<unknown>) { setPending(true); setError(null); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Voting action failed."); } finally { setPending(false); } }
  if (trip.loading || candidates.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading votes…</p>;
  if (trip.error || candidates.error || !trip.data) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || candidates.error?.message || "Trip not found."}</p>;
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{trip.data.name}</p><h1 className="mt-2 font-display text-3xl font-extrabold">Candidate voting</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Choose WANT, NEUTRAL, or AVOID for each place.</p></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{isOwner && trip.data.phase === "COLLECTING" && <Card className="flex flex-wrap items-center justify-between gap-4 p-5"><p className="text-sm">Ready to collect votes?</p><Button disabled={pending} onClick={() => move(() => startVoting({ tripId, expectedPlanningCycle: trip.data!.planningCycle }))}>{pending ? "Starting…" : "Start voting"}</Button></Card>}{isOwner && trip.data.phase === "VOTING" && <Card className="flex flex-wrap items-center justify-between gap-4 p-5"><p className="text-sm">All members have voted?</p><Button disabled={pending} onClick={() => move(() => closeVoting({ tripId, expectedPlanningCycle: trip.data!.planningCycle }))}>{pending ? "Closing…" : "Close voting"}</Button></Card>}{trip.data.phase !== "VOTING" ? <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-soft)]">Voting is available when the trip enters VOTING.</p> : <div className="grid gap-4 sm:grid-cols-2">{(candidates.data ?? []).map((candidate) => <VoteRow key={candidate.id} tripId={tripId} planningCycle={trip.data!.planningCycle} candidateId={candidate.id} name={candidate.name} />)}</div>}</div>;
}

function VoteRow({ tripId, planningCycle, candidateId, name }: { tripId: string; planningCycle: number; candidateId: string; name: string }) {
  const vote = useOwnCandidateVote(tripId, planningCycle, candidateId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function update(value: CandidateVoteValue) { setPending(true); setError(null); try { await castCandidateVote({ tripId, expectedPlanningCycle: planningCycle, candidateId, value }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Vote failed."); } finally { setPending(false); } }
  return <Card className="p-5"><h2 className="font-display text-lg font-bold">{name}</h2><select disabled={pending} value={vote.data?.value ?? "NEUTRAL"} onChange={(event) => update(event.target.value as CandidateVoteValue)} className="mt-4 w-full rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm">{values.map((value) => <option key={value}>{value}</option>)}</select>{vote.error && <p className="mt-2 text-xs text-red-700">{vote.error.message}</p>}{error && <p className="mt-2 text-xs text-red-700">{error}</p>}</Card>;
}
