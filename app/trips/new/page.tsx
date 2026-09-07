"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { createTrip } from "@/lib/api/trips";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { validateTripSetupDates } from "@/lib/trips/validation";
import { TRANSPORT_LABELS } from "@/lib/trips/mapping";
import type { TransportMode } from "@travel-planner/shared";

export default function CreateTripPage() {
  const router = useRouter();
  const { user, signIn } = useAuth();
  const [name, setName] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [destinationPlaceId, setDestinationPlaceId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
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
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!user) return signIn();
    if (dateError) return setError(dateError);
    if (!name.trim() || !destinationPlaceId.trim() || !destinationName.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return setError("Add a trip name and a real Google Place ID with coordinates.");
    setPending(true);
    setError(null);
    try {
      const result = await createTrip({ name: name.trim(), destinationPlaceId: destinationPlaceId.trim(), startDate, endDate, baseLocation: { name: destinationName.trim(), lat: latitude, lng: longitude, placeId: destinationPlaceId.trim(), source: "USER_CONFIRMED" }, defaultDayWindow: { startTime, endTime }, dayOverrides: [], primaryTransport: transport, activityBudgetCurrency: "MYR" });
      router.push(`/trips/${result.tripId}?invite=${encodeURIComponent(result.inviteToken)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trip creation failed.");
      setPending(false);
    }
  }

  return <div className="mx-auto max-w-2xl"><Link href="/my-trips" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)]"><ArrowLeft size={15} /> Back to My Trips</Link><h1 className="font-display text-2xl font-bold sm:text-3xl">Create a trip</h1><p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">Use a Google Place ID so the backend can resolve the destination safely.</p><form onSubmit={handleSubmit} className="mt-8 space-y-5"><Card className="space-y-4 p-5"><label className="block text-sm font-semibold">Trip name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="Tokyo weekend" /></label><label className="block text-sm font-semibold">Destination name<input value={destinationName} onChange={(event) => setDestinationName(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="Tokyo, Japan" /></label><label className="block text-sm font-semibold">Google Place ID<input value={destinationPlaceId} onChange={(event) => setDestinationPlaceId(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="ChIJ…" /></label><p className="text-xs text-[var(--color-ink-soft)]"><MapPin size={12} className="mr-1 inline" />The browser Places autocomplete key can be added later; the backend remains authoritative for place resolution.</p><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Latitude<input type="number" step="any" value={lat} onChange={(event) => setLat(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="35.6762" /></label><label className="block text-sm font-semibold">Longitude<input type="number" step="any" value={lng} onChange={(event) => setLng(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" placeholder="139.6503" /></label></div></Card><Card className="grid gap-4 p-5 sm:grid-cols-2"><label className="block text-sm font-semibold">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">Daily start<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label><label className="block text-sm font-semibold">Daily end<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm" /></label></Card><Card className="p-5"><label className="block text-sm font-semibold">Primary transport<select value={transport} onChange={(event) => setTransport(event.target.value as TransportMode)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm">{Object.entries(TRANSPORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></Card>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" fullWidth size="lg" disabled={pending}>{pending ? "Creating trip…" : "Create trip"}</Button></form></div>;
}
