"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Copy, MapPin } from "lucide-react";
import { resetInvite, removeMember, leaveTrip, transferOwnership } from "@/lib/api/membership";
import { useAuth } from "@/lib/auth/use-auth";
import { useTrip } from "@/lib/hooks/use-trip";
import { useTripMembers } from "@/lib/hooks/use-trip-members";
import { LinkButton } from "@/components/ui/Button";
import { getPhaseLabel, getPrimaryTripRoute } from "@/lib/navigation/trip-phase";
import { TripHeader } from "@/components/trip/TripHeader";
import { Card } from "@/components/ui/Card";
import { useCandidates } from "@/lib/hooks/use-candidates";
import { useSubmissions } from "@/lib/hooks/use-submissions";


export default function TripDashboard({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const trip = useTrip(tripId);
  const members = useTripMembers(tripId);
  const candidates = useCandidates(tripId);
  const submissions = useSubmissions(tripId);
  const invite = useSearchParams().get("invite");
  const [copied, setCopied] = useState(false);
  const [latestInvite, setLatestInvite] = useState(invite);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!user) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Sign in to open this trip.</p>;
  if (trip.loading || members.loading || candidates.loading || submissions.loading) return <p className="py-20 text-center text-sm text-[var(--color-ink-soft)]">Loading trip…</p>;
  if (trip.error || members.error || candidates.error || submissions.error) return <p className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{trip.error?.message || members.error?.message || candidates.error?.message || submissions.error?.message || "Trip could not be loaded."}</p>;
  if (!trip.data) return <p className="py-20 text-center text-sm">Trip not found or you are not a member.</p>;

  const currentMember = members.data?.find((member) => member.id === user.uid);
  const isOwner = currentMember?.role === "OWNER";
  const nextRoute = getPrimaryTripRoute(trip.data);
  async function copyInvite() { if (!latestInvite) return; await navigator.clipboard?.writeText(`${window.location.origin}/join?tripId=${encodeURIComponent(tripId)}&invite=${encodeURIComponent(latestInvite)}`); setCopied(true); }
  async function runAction(key: string, action: () => Promise<unknown>) { setPendingAction(key); setActionError(null); try { await action(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Membership action failed."); } finally { setPendingAction(null); } }

  const suggestedByMembers = new Set((submissions.data ?? []).map((submission) => submission.memberId)).size;
  return <div><TripHeader trip={trip.data} memberCount={trip.data.activeMemberCount} role={currentMember?.role} /><div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]"><div className="space-y-6"><Card className="p-6"><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"><MapPin size={22} /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">What&apos;s next</p><h2 className="mt-0.5 font-display text-lg font-bold">{getPhaseLabel(trip.data.phase)}</h2><p className="mt-1 text-sm text-[var(--color-ink-soft)]">The backend controls the current workflow phase and available actions.</p><LinkButton href={nextRoute} className="mt-4" iconRight={<ArrowRight size={15} />}>Open next step</LinkButton></div></div></Card><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><StatCard label="Members" value={String(trip.data.activeMemberCount)} /><StatCard label="Candidates" value={String(candidates.data?.length ?? 0)} /><StatCard label="Contributors" value={String(suggestedByMembers)} /><StatCard label="Role" value={currentMember?.role ?? "—"} /></div>{isOwner && latestInvite && <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-sand)] p-5"><p className="text-sm font-semibold">Share this invite token</p><div className="mt-3 flex flex-wrap items-center gap-3"><code className="rounded-lg bg-white px-3 py-2 text-xs">{latestInvite}</code><button type="button" onClick={copyInvite} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ink)] px-3 py-2 text-xs font-semibold text-white"><Copy size={13} />{copied ? "Copied" : "Copy invite link"}</button><button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction("reset", async () => setLatestInvite((await resetInvite({ tripId })).inviteToken))} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">Reset token</button></div></section>}</div><Card className="h-fit p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-base font-bold">Group status</h3>{!isOwner && <button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction("leave", () => leaveTrip({ tripId, expectedPlanningCycle: trip.data!.planningCycle }))} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Leave trip</button>}</div>{actionError && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}<div className="space-y-3">{(members.data ?? []).filter((member) => member.status === "ACTIVE").map((member) => <div key={member.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border-soft)] pb-3"><div><p className="text-sm font-semibold">{member.displayName}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{member.role} · {member.uid === user.uid ? "You" : "Active"}</p></div>{isOwner && member.uid !== user.uid && <div className="flex gap-2"><button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction(`remove-${member.uid}`, () => removeMember({ tripId, expectedPlanningCycle: trip.data!.planningCycle, memberId: member.uid }))} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700">Remove</button><button type="button" disabled={Boolean(pendingAction)} onClick={() => runAction(`transfer-${member.uid}`, () => transferOwnership({ tripId, newOwnerId: member.uid }))} className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">Transfer</button></div>}</div>)}</div></Card></div></div>;
}

function StatCard({ label, value }: { label: string; value: string }) { return <Card className="p-4"><p className="text-xs font-medium text-[var(--color-ink-soft)]">{label}</p><p className="mt-1 break-words font-display text-xl font-bold">{value}</p></Card>; }
