"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { joinTrip } from "@/lib/api/membership";

export default function JoinPage() {
  return <Suspense fallback={<p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading join form…</p>}><JoinForm /></Suspense>;
}

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [tripId, setTripId] = useState(params.get("tripId") || "");
  const [inviteToken, setInviteToken] = useState(params.get("invite") || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true); setError(null);
    try { const result = await joinTrip({ tripId: tripId.trim(), inviteToken: inviteToken.trim() }); router.push(`/trips/${result.tripId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join this trip."); setPending(false); }
  }

  return <div className="mx-auto max-w-lg"><h1 className="font-display text-3xl font-bold">Join a trip</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Use the trip ID and invite token shared by the trip owner.</p><Card className="mt-8 p-6"><form onSubmit={submit} className="space-y-5"><label className="block text-sm font-semibold">Trip ID<input value={tripId} onChange={(event) => setTripId(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">Invite token<input value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" fullWidth disabled={pending}>{pending ? "Joining…" : "Join trip"}</Button></form></Card></div>;
}
