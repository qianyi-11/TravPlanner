"use client";

import { useShallow } from "zustand/react/shallow";
import { MapPin, Sparkles, UtensilsCrossed, Wallet } from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { MemberAvatar } from "@/components/ui/Avatar";
import { Card, Chip } from "@/components/ui/Card";
import { GroupCard } from "@/components/trip/GroupCard";
import { TripCard } from "@/components/trip/TripCard";
import { EmptyState } from "@/components/ui/States";

export default function ProfilePage() {
  const me = usePlannerStore((s) => s.members[s.currentUserId]);
  const groups = usePlannerStore(
    useShallow((s) => Object.values(s.groups).filter((g) => g.memberIds.includes(s.currentUserId)))
  );
  const trips = usePlannerStore(
    useShallow((s) => Object.values(s.trips).filter((t) => t.memberIds.includes(s.currentUserId)))
  );

  if (!me) return null;

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
