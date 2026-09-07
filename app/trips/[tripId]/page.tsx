"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Copy, MapPin, Users } from "lucide-react";
import { resetInvite, removeMember, leaveTrip, transferOwnership } from "@/lib/api/membership";
import { useAuth } from "@/lib/auth/use-auth";
import { useTrip } from "@/lib/hooks/use-trip";
import { useTripMembers } from "@/lib/hooks/use-trip-members";
import { LinkButton } from "@/components/ui/Button";
import { getPhaseLabel, getPrimaryTripRoute } from "@/lib/navigation/trip-phase";


export default function TripDashboard({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const trip = useTrip(tripId);
  const members = useTripMembers(tripId);
  const invite = useSearchParams().get("invite");
  const [copied, setCopied] = useState(false);
  const [latestInvite, setLatestInvite] = useState(invite);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!user) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Sign in to open this trip.</p>;
  if (trip.loading || members.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading trip…</p>;
  if (trip.error || members.error) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || members.error?.message || "Trip could not be loaded."}</p>;
  if (!trip.data) return <p className="py-20 text-center text-sm">Trip not found or you are not a member.</p>;

  const currentMember = members.data?.find((member) => member.id === user.uid);
  const isOwner = currentMember?.role === "OWNER";
  const nextRoute = getPrimaryTripRoute(trip.data);
  async function copyInvite() { if (!latestInvite) return; await navigator.clipboard?.writeText(`${window.location.origin}/join?tripId=${encodeURIComponent(tripId)}&invite=${encodeURIComponent(latestInvite)}`); setCopied(true); }
  async function runAction(key: string, action: () => Promise<unknown>) { setPendingAction(key); setActionError(null); try { await action(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Membership action failed."); } finally { setPendingAction(null); } }

  return <div className="space-y-6"><section className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{getPhaseLabel(trip.data.phase)}</p><h1 className="mt-2 font-display text-3xl font-extrabold">{trip.data.name}</h1><p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)]"><MapPin size={14} />{trip.data.destination.name}</p></div><LinkButton href={nextRoute}>Next: {getPhaseLabel(trip.data.phase)}</LinkButton></div><div className="mt-7 grid gap-4 text-sm sm:grid-cols-3"><div className="flex items-center gap-2"><CalendarDays size={16} />{trip.data.startDate} → {trip.data.endDate}</div><div className="flex items-center gap-2"><Users size={16} />{trip.data.activeMemberCount} member{trip.data.activeMemberCount === 1 ? "" : "s"}</div><div><span className="font-semibold">Your role:</span> {currentMember?.role || "Unknown"}</div></div></section>{isOwner && latestInvite && <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-sand)] p-5"><p className="text-sm font-semibold">Share this invite token</p><div className="mt-3 flex flex-wrap items-center gap-3"><code className="rounded-lg bg-white px-3 py-2 text-xs">{latestInvite}</code><button type="button" onClick={copyInvite} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ink)] px-3 py-2 text-xs font-semibold text-white"><Copy size={13} />{copied ? "Copied" : "Copy invite link"}</button><button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction("reset", async () => setLatestInvite((await resetInvite({ tripId })).inviteToken))} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">Reset token</button></div></section>}<section><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Members</h2>{!isOwner && <button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction("leave", () => leaveTrip({ tripId, expectedPlanningCycle: trip.data!.planningCycle }))} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Leave trip</button>}</div>{actionError && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}<div className="grid gap-3 sm:grid-cols-2">{(members.data ?? []).filter((member) => member.status === "ACTIVE").map((member) => <div key={member.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{member.displayName}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{member.role} · {member.uid === user.uid ? "You" : "Active"}</p></div>{isOwner && member.uid !== user.uid && <div className="flex gap-2"><button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction(`remove-${member.uid}`, () => removeMember({ tripId, expectedPlanningCycle: trip.data!.planningCycle, memberId: member.uid }))} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700">Remove</button><button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction(`transfer-${member.uid}`, () => transferOwnership({ tripId, newOwnerId: member.uid }))} className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">Transfer</button></div>}</div></div>)}</div></section></div>;
}
