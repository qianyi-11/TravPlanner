"use client";

import { ArrowRight, CalendarDays, Plus, Scale, Users2, Vote } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { LinkButton } from "@/components/ui/Button";
import { TripCard } from "@/components/trip/TripCard";
import { usePlannerStore } from "@/lib/store";

export default function HomePage() {
  const trips = usePlannerStore(useShallow((s) => Object.values(s.trips)));

  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white px-6 py-14 sm:px-14 sm:py-20">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-primary-soft), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-teal-soft), transparent 70%)" }}
        />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-sand)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
            Plan together, not alone
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-[var(--color-ink)] sm:text-5xl">
            Turn different travel wishes into one shared plan.
          </h1>
          <p className="mt-4 max-w-lg text-base text-[var(--color-ink-soft)] sm:text-lg">
            Trippy turns different preferences, suggestions and votes into an explainable Group Consensus, then a
            shared itinerary everyone can use.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/groups" size="lg" icon={<Plus size={18} />}>
              Create a Trip
            </LinkButton>
            <LinkButton href="/groups/new" size="lg" variant="outline">
              Create a Group
            </LinkButton>
          </div>

          <div className="mt-10 flex flex-wrap gap-6 text-sm text-[var(--color-ink-soft)]">
            <Step icon={Users2} label="Different preferences" />
            <Step icon={Vote} label="Suggestions + votes" />
            <Step icon={Scale} label="Consensus explains why" />
            <Step icon={CalendarDays} label="Shared itinerary" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">Upcoming trips</h2>
          <a href="/my-trips" className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
            View all <ArrowRight size={14} />
          </a>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-[var(--color-ink)] px-6 py-12 sm:px-14">
        <h2 className="font-display text-2xl font-bold text-white">How it works</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-4">
          {[
            { title: "Suggest", desc: "Every member adds the places they want to visit." },
            { title: "Vote", desc: "The group votes on the ideas that matter most." },
            { title: "Review", desc: "Review saved ratings, hours, costs, and availability notes." },
            { title: "Build", desc: "We arrange the selected places into one planned itinerary." },
          ].map((s, i) => (
            <div key={s.title}>
              <span className="font-display text-3xl font-extrabold text-white/25">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-display font-semibold text-white">{s.title}</h3>
              <p className="mt-1 text-sm text-white/60">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Step({ icon: Icon, label }: { icon: typeof Users2; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-sand)]">
        <Icon size={15} />
      </div>
      <span className="font-medium">{label}</span>
    </div>
  );
}
