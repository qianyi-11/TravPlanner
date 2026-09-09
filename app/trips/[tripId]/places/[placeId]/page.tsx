"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Ticket,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePlannerStore } from "@/lib/store";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { MapView } from "@/components/trip/MapView";
import { Badge, Card } from "@/components/ui/Card";
import { MemberStack } from "@/components/ui/Avatar";
import { formatMinutes } from "@/lib/utils";

export default function PlaceDetailsPage({
  params,
}: {
  params: Promise<{ tripId: string; placeId: string }>;
}) {
  const { tripId, placeId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const place = usePlannerStore((s) => s.places[placeId]);
  const members = usePlannerStore((s) => s.members);

  if (!trip || !place) notFound();

  const isShortlisted = trip.shortlistPlaceIds.includes(place.id);
  const suggesters = place.suggestedBy.map((id) => members[id]).filter(Boolean);

  const availabilityBadge = {
    available: { tone: "success" as const, label: "Available" },
    limited: { tone: "warning" as const, label: "Limited Availability" },
    sold_out: { tone: "danger" as const, label: "Sold Out" },
  }[place.availability];

  return (
    <div>
      <Link
        href={`/trips/${tripId}/places/all`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft size={15} /> Back
      </Link>

      <div className="grid gap-3 sm:grid-cols-4 sm:grid-rows-2">
        <PlaceCover photo={place.photo} category={place.category} className="col-span-4 h-56 rounded-3xl sm:col-span-2 sm:row-span-2 sm:h-full" iconSize={44} />
        <PlaceCover photo={place.photo} category={place.category} className="hidden h-full rounded-2xl opacity-80 sm:block" iconSize={26} />
        <PlaceCover photo={place.photo} category={place.category} className="hidden h-full rounded-2xl opacity-60 sm:block" iconSize={26} />
        <PlaceCover photo={place.photo} category={place.category} className="hidden h-full rounded-2xl opacity-80 sm:block" iconSize={26} />
        <PlaceCover photo={place.photo} category={place.category} className="hidden h-full rounded-2xl opacity-60 sm:block" iconSize={26} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{place.category}</Badge>
              {isShortlisted && (
                <Badge tone="teal">
                  <BadgeCheck size={12} /> Validated
                </Badge>
              )}
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold">{place.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-ink-soft)]">
              <span className="flex items-center gap-1 font-semibold text-[var(--color-ink)]">
                <Star size={14} className="fill-[var(--color-warning)] text-[var(--color-warning)]" />
                {place.rating}
              </span>
              <span>{place.reviewCount.toLocaleString()} reviews</span>
              <span className={place.isOpenNow ? "font-medium text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                {place.isOpenNow ? `Open${place.closesAt ? ` until ${place.closesAt}` : ""}` : "Closed"}
              </span>
            </div>
            {suggesters.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <MemberStack members={suggesters} max={4} size="xs" />
                <span className="text-xs text-[var(--color-ink-soft)]">
                  Suggested by {suggesters.map((m) => m.name).join(", ")}
                </span>
              </div>
            )}
          </div>

          <Section title="Overview">
            <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">{place.description}</p>
          </Section>

          <Section title="Hours">
            <ul className="space-y-1.5 text-sm">
              {place.openingHours.map((h) => (
                <li key={h.day} className="flex items-center justify-between">
                  <span className="text-[var(--color-ink-soft)]">{h.day}</span>
                  <span className="font-medium">{h.hours}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Reviews">
            {place.reviews.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {place.reviews.map((r) => (
                  <div key={r.id} className="border-b border-[var(--color-border-soft)] pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{r.author}</span>
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        <Star size={11} className="fill-[var(--color-warning)] text-[var(--color-warning)]" />
                        {r.rating}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{r.text}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{r.date}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Location">
            <p className="mb-3 text-sm text-[var(--color-ink-soft)]">{place.address}</p>
            <div className="h-52 overflow-hidden rounded-2xl">
              <MapView places={[place]} showRoute={false} />
            </div>
          </Section>

          <Section title="Travel Time">
            <p className="text-sm text-[var(--color-ink-soft)]">
              {isShortlisted
                ? "Travel time to and from nearby stops is calculated in the Route step, based on your final itinerary order."
                : "Travel time will be calculated once this place is shortlisted and the route is optimized."}
            </p>
          </Section>
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <InfoRow icon={Clock} label="Estimated visit" value={formatMinutes(place.estimatedDurationMinutes)} />
            <InfoRow icon={Wallet} label="Price" value={place.priceLabel} />
            <InfoRow icon={MapPin} label="Area" value={`${place.area}, ${place.destination}`} />
            <InfoRow icon={Phone} label="Address" value={place.address} />
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
              <ShieldCheck size={15} className="text-[var(--color-teal)]" /> Availability
            </h3>
            <Badge tone={availabilityBadge.tone}>{availabilityBadge.label}</Badge>
            {place.availability === "limited" && (
              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                Slots are filling up — booking ahead is recommended.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
              <Ticket size={15} className="text-[var(--color-primary)]" /> Price
            </h3>
            <p className="font-display text-lg font-bold">{place.priceLabel}</p>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Estimated, per person</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-display text-base font-bold">{title}</h3>
      {children}
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sand)]">
        <Icon size={15} className="text-[var(--color-ink-soft)]" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-ink-soft)]">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
