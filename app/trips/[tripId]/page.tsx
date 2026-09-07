"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Copy, MapPin, Users } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { useTrip } from "@/lib/hooks/use-trip";
import { useTripMembers } from "@/lib/hooks/use-trip-members";
import { LinkButton } from "@/components/ui/Button";

const PHASE_LABELS = { COLLECTING: "Collecting ideas", VOTING: "Candidate voting", PLANNING: "Planning options", REVIEW: "Review", FINALIZED: "Finalized" } as const;
const PHASE_ROUTES = { COLLECTING: "/places", VOTING: "/vote", PLANNING: "/generating", REVIEW: "/itinerary", FINALIZED: "/plan" } as const;

export default function TripDashboard({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const trip = useTrip(tripId);
  const members = useTripMembers(tripId);
  const invite = useSearchParams().get("invite");
  const [copied, setCopied] = useState(false);

  if (!user) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Sign in to open this trip.</p>;
  if (trip.loading || members.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading trip…</p>;
  if (trip.error || members.error) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || members.error?.message || "Trip could not be loaded."}</p>;
  if (!trip.data) return <p className="py-20 text-center text-sm">Trip not found or you are not a member.</p>;

  const currentMember = members.data?.find((member) => member.id === user.uid);
  const isOwner = currentMember?.role === "OWNER";
  const nextRoute = `/trips/${tripId}${PHASE_ROUTES[trip.data.phase]}`;
  async function copyInvite() { if (!invite) return; await navigator.clipboard?.writeText(`${window.location.origin}/join?invite=${encodeURIComponent(invite)}`); setCopied(true); }

  return <div className="space-y-6"><section className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{PHASE_LABELS[trip.data.phase]}</p><h1 className="mt-2 font-display text-3xl font-extrabold">{trip.data.name}</h1><p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)]"><MapPin size={14} />{trip.data.destination.name}</p></div><LinkButton href={nextRoute}>Next: {PHASE_LABELS[trip.data.phase]}</LinkButton></div><div className="mt-7 grid gap-4 text-sm sm:grid-cols-3"><div className="flex items-center gap-2"><CalendarDays size={16} />{trip.data.startDate} → {trip.data.endDate}</div><div className="flex items-center gap-2"><Users size={16} />{trip.data.activeMemberCount} member{trip.data.activeMemberCount === 1 ? "" : "s"}</div><div><span className="font-semibold">Your role:</span> {currentMember?.role || "Unknown"}</div></div></section>{isOwner && invite && <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-sand)] p-5"><p className="text-sm font-semibold">Share this invite token</p><div className="mt-3 flex flex-wrap items-center gap-3"><code className="rounded-lg bg-white px-3 py-2 text-xs">{invite}</code><button type="button" onClick={copyInvite} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ink)] px-3 py-2 text-xs font-semibold text-white"><Copy size={13} />{copied ? "Copied" : "Copy invite link"}</button></div></section>}<section><h2 className="mb-4 font-display text-xl font-bold">Members</h2><div className="grid gap-3 sm:grid-cols-2">{(members.data ?? []).filter((member) => member.status === "ACTIVE").map((member) => <div key={member.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4"><p className="font-semibold">{member.displayName}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{member.role} · {member.uid === user.uid ? "You" : "Active"}</p></div>)}</div></section></div>;
}
