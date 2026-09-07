"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createTrip } from "@/lib/api/trips";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { validateTripSetupDates } from "@/lib/trips/validation";
import { TRANSPORT_LABELS } from "@/lib/trips/mapping";
import type { TransportMode } from "@travel-planner/shared";
import { PlaceAutocomplete, type PlaceSelection } from "@/components/places/PlaceAutocomplete";

export default function CreateTripPage() {
  const router = useRouter();
  const { user, signIn } = useAuth();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<PlaceSelection | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("22:00");
  const [transport, setTransport] = useState<TransportMode>("WALKING");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const dateError = validateTripSetupDates(startDate, endDate, startTime, endTime);
    if (!user) return signIn();
    if (dateError) return setError(dateError);
    if (!name.trim() || !destination) return setError("Add a trip name and select a real destination.");
    setPending(true);
    setError(null);
    try {
      const result = await createTrip({ name: name.trim(), destinationPlaceId: destination.placeId, startDate, endDate, baseLocation: { name: destination.name, lat: destination.lat, lng: destination.lng, placeId: destination.placeId, source: "USER_CONFIRMED" }, defaultDayWindow: { startTime, endTime }, dayOverrides: [], primaryTransport: transport, activityBudgetCurrency: "MYR" });
      router.push(`/trips/${result.tripId}?invite=${encodeURIComponent(result.inviteToken)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trip creation failed.");
      setPending(false);
    }
  }

  return <div className="mx-auto max-w-2xl"><Link href="/my-trips" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)]"><ArrowLeft size={15} /> Back to My Trips</Link><h1 className="font-display text-2xl font-bold sm:text-3xl">Create a trip</h1><p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">Search for a destination and choose a real place from Google.</p><form onSubmit={handleSubmit} className="mt-8 space-y-5"><Card className="space-y-4 p-5"><label className="block text-sm font-semibold">Trip name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="Tokyo weekend" /></label><label className="block text-sm font-semibold">Destination<PlaceAutocomplete label="Destination" placeholder="Search for a destination…" onChange={setDestination} /></label>{destination && <p className="text-xs text-[var(--color-ink-soft)]">Selected: {destination.formattedAddress || destination.name}</p>}<p className="text-xs text-[var(--color-ink-soft)]">Google provides the place details for this form; the backend still validates the selected Place ID.</p></Card><Card className="grid gap-4 p-5 sm:grid-cols-2"><label className="block text-sm font-semibold">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">Daily start<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">Daily end<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label></Card><Card className="p-5"><label className="block text-sm font-semibold">Primary transport<select value={transport} onChange={(event) => setTransport(event.target.value as TransportMode)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm">{Object.entries(TRANSPORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></Card>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" fullWidth size="lg" disabled={pending}>{pending ? "Creating trip…" : "Create trip"}</Button></form></div>;
}
