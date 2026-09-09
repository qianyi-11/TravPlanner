"use client";

import { useShallow } from "zustand/react/shallow";
import { MapPin, Sparkles, UtensilsCrossed, Wallet } from "lucide-react";
import { useState } from "react";
import { usePlannerStore } from "@/lib/store";
import { MemberAvatar } from "@/components/ui/Avatar";
import { Card, Chip } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GroupCard } from "@/components/trip/GroupCard";
import { TripCard } from "@/components/trip/TripCard";
import { EmptyState } from "@/components/ui/States";

export default function ProfilePage() {
  const me = usePlannerStore((s) => s.members[s.currentUserId]);
  const members = usePlannerStore(useShallow((s) => Object.values(s.members)));
  const switchDemoUser = usePlannerStore((s) => s.switchDemoUser);
  const resetDemoUser = usePlannerStore((s) => s.resetDemoUser);
  const [switchingUser, setSwitchingUser] = useState(false);
  const groups = usePlannerStore(
    useShallow((s) => Object.values(s.groups).filter((g) => g.memberIds.includes(s.currentUserId)))
  );
  const trips = usePlannerStore(
    useShallow((s) => Object.values(s.trips).filter((t) => t.memberIds.includes(s.currentUserId)))
  );

  if (!me) return null;

  async function handleDemoUserChange(memberId: string) {
    if (memberId === me.id) return;
    setSwitchingUser(true);
    try {
      await switchDemoUser(memberId);
    } finally {
      setSwitchingUser(false);
    }
  }

  async function handleResetDemoSession() {
    setSwitchingUser(true);
    try {
      await resetDemoUser();
    } finally {
      setSwitchingUser(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-5 rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-soft)]">
        <MemberAvatar member={me} size="lg" />
        <div>
          <h1 className="font-display text-2xl font-bold">{me.name}</h1>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {groups.length} groups · {trips.length} trips
          </p>
        </div>
      </div>

      <Card className="mt-8 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Demo session</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Prototype only — choose which traveller you are demonstrating as.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="demo-traveller" className="text-sm font-medium text-[var(--color-ink-soft)]">
              Demo as
            </label>
            <select
              id="demo-traveller"
              value={me.id}
              disabled={switchingUser}
              onChange={(event) => handleDemoUserChange(event.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-ink)] outline-none"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" disabled={switchingUser} onClick={handleResetDemoSession}>
              Reset demo session
            </Button>
            {switchingUser && <span className="text-xs text-[var(--color-ink-soft)]">Switching…</span>}
          </div>
        </div>
      </Card>

      <div className="mt-8">
        <h2 className="mb-4 font-display text-lg font-bold">Your travel profile</h2>
        {me.preferences ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                <Sparkles size={12} /> Interests
              </p>
              <div className="flex flex-wrap gap-1.5">
                {me.preferences.interests.map((i) => (
                  <Chip key={i} label={i} selected />
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                <UtensilsCrossed size={12} /> Food preferences
              </p>
              <div className="flex flex-wrap gap-1.5">
                {me.preferences.foodPreferences.map((f) => (
                  <Chip key={f} label={f} selected />
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Pace</p>
              <p className="font-display text-lg font-bold">{me.preferences.pace}</p>
            </Card>
            <Card className="p-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                <Wallet size={12} /> Typical budget
              </p>
              <p className="font-display text-lg font-bold">RM {me.preferences.personalBudget.toLocaleString()}</p>
            </Card>
          </div>
        ) : (
          <EmptyState icon={Sparkles} title="No preferences set yet" description="Set your preferences from any trip workspace." />
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 font-display text-lg font-bold">Your groups</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-1.5 font-display text-lg font-bold">
          <MapPin size={16} /> Your trips
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
