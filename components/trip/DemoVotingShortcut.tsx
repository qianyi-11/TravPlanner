"use client";

import { useState } from "react";
import { Loader2, Users, Zap } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";

/**
 * DEMO ONLY — remove once there's a login and people can vote as themselves.
 * Lets a presenter fill in everyone else's votes with one click instead of
 * signing in and out of six accounts on stage.
 */
export function DemoVotingShortcut({ tripId }: { tripId: string }) {
  const completeVoting = usePlannerStore((s) => s.completeVotingForDemo);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const pending = usePlannerStore((s) =>
    s.trips[tripId]
      ? s.trips[tripId].memberIds.filter((id) => !s.members[id]?.hasSubmittedVotes).length
      : 0
  );
  const [busy, setBusy] = useState(false);

  if (!trip) return null;

  const done = pending === 0;

  async function run() {
    setBusy(true);
    try {
      await completeVoting(tripId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-violet)] bg-[var(--color-violet-soft)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex items-center gap-1 rounded-full bg-[var(--color-violet)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          <Zap size={10} /> Demo
        </span>
        <span className="text-xs font-semibold text-[var(--color-violet)]">Stands in for logging in</span>
      </div>
      <p className="text-xs text-[var(--color-ink-soft)]">
        {done
          ? "Everyone in this group has voted — the group can move on to the shortlist."
          : `There's no login yet, so ${pending} member${pending > 1 ? "s" : ""} can't vote as ${
              pending > 1 ? "themselves" : "themself"
            }. Cast their votes here to unblock the next step.`}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        disabled={busy || done}
        icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
        onClick={run}
      >
        {busy ? "Voting…" : done ? "All votes in" : "Vote as everyone else"}
      </Button>
    </div>
  );
}
