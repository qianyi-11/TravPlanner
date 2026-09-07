"use client";

import { Compass, LogIn, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { useMyTrips } from "@/lib/hooks/use-my-trips";
import { LinkButton } from "@/components/ui/Button";
import { TripCard } from "@/components/trip/TripCard";

export default function MyTripsPage() {
  const { user, signIn } = useAuth();
  const trips = useMyTrips();

  if (!user) return <section className="mx-auto max-w-lg rounded-3xl border border-[var(--color-border)] bg-white p-10 text-center"><LogIn className="mx-auto" /><h1 className="mt-4 font-display text-2xl font-bold">Sign in to see your trips</h1><button type="button" onClick={signIn} className="mt-6 rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-white">Continue with Google</button></section>;
  if (trips.loading) return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-sand)]" />)}</div>;
  if (trips.error) return <State title="Could not load your trips" detail={trips.error.message} icon={<RefreshCw size={18} />} />;

  const activeTrips = (trips.data ?? []).filter((trip) => trip.status === "ACTIVE");
  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4"><div><h1 className="font-display text-2xl font-bold sm:text-3xl">My Trips</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Trips you are actively planning.</p></div><LinkButton href="/trips/new" icon={<Plus size={16} />}>New Trip</LinkButton></div>
      {activeTrips.length === 0 ? <State title="No trips yet" detail="Create a trip or join one with an invite." icon={<Compass size={18} />} actions={<><LinkButton href="/trips/new">Create Trip</LinkButton><LinkButton href="/join" variant="outline">Join Trip</LinkButton></>} /> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{activeTrips.map((trip) => <TripCard key={trip.id} trip={{ id: trip.id, name: trip.tripName, destinationName: trip.destinationName, startDate: trip.startDate, endDate: trip.endDate, role: trip.role }} />)}</div>}
    </div>
  );
}

function State({ title, detail, icon, actions }: { title: string; detail: string; icon: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="mx-auto max-w-lg rounded-3xl border border-[var(--color-border)] bg-white p-10 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-sand)]">{icon}</div><h2 className="mt-4 font-display text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-[var(--color-ink-soft)]">{detail}</p>{actions && <div className="mt-6 flex justify-center gap-3">{actions}</div>}</div>;
}
