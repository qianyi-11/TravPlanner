"use client";

import { useAuth } from "@/lib/auth/use-auth";
import { useMyTrips } from "@/lib/hooks/use-my-trips";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ProfilePage() {
  const { user, loading, error, signIn, signOut } = useAuth();
  const trips = useMyTrips();
  const memberships = trips.data ?? [];

  if (loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading profile…</p>;
  if (!user) return <div className="mx-auto max-w-lg rounded-3xl border border-[var(--color-border)] bg-white p-10 text-center"><h1 className="font-display text-2xl font-bold">Sign in to view your profile</h1><Button className="mt-6" onClick={signIn}>Continue with Google</Button>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}</div>;

  const name = user.displayName || user.email || "Traveler";
  return <div className="space-y-8"><Card className="flex flex-wrap items-center justify-between gap-4 p-6"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg font-bold text-white">{name.slice(0, 1).toUpperCase()}</div><div><h1 className="font-display text-2xl font-bold">{name}</h1><p className="text-sm text-[var(--color-ink-soft)]">{user.email || "Google account"}</p></div></div><Button variant="outline" onClick={signOut}>Sign out</Button></Card><section><h2 className="mb-4 font-display text-lg font-bold">Your trips</h2>{trips.loading && <p className="text-sm text-[var(--color-ink-soft)]">Loading trips…</p>}{trips.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{trips.error.message}</p>}{!trips.loading && !trips.error && memberships.length === 0 && <Card className="p-6"><p className="text-sm text-[var(--color-ink-soft)]">No trips yet.</p><LinkButton className="mt-4" href="/trips/new">Create a trip</LinkButton></Card>}<div className="grid gap-4 sm:grid-cols-2">{memberships.map(trip => <LinkButton key={trip.id} href={`/trips/${trip.tripId}`} variant="outline" fullWidth className="flex-col items-start text-left"><span className="font-display text-lg font-bold">{trip.tripName}</span><span className="mt-1 text-xs">{trip.destinationName} · {trip.startDate} → {trip.endDate}</span><span className="mt-3 text-xs font-semibold">{trip.role}</span></LinkButton>)}</div></section></div>;
}
