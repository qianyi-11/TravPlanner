"use client";

import { use } from "react";
import { notFound, useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Clock, MapPin, ShieldCheck, Star, Wallet } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCover } from "@/components/trip/CategoryIcon";
import { Badge, Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { formatMinutes } from "@/lib/utils";

export default function ValidatePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const places = usePlannerStore(
    useShallow((s) => (trip ? trip.shortlistPlaceIds.map((id) => s.places[id]).filter(Boolean) : []))
  );
  const setStage = usePlannerStore((s) => s.setStage);

  if (!trip) notFound();

  const soldOut = places.filter((p) => p.availability === "sold_out").length;
  const limited = places.filter((p) => p.availability === "limited").length;

  function handleContinue() {
    setStage(tripId, "route");
    router.push(`/trips/${tripId}/route`);
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Detailed place validation</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            We&apos;ve checked real hours, pricing and availability for every shortlisted place.
          </p>
        </div>
        <Button onClick={handleContinue} iconRight={<ArrowRight size={15} />}>
          Continue to Route
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Badge tone="success">
          <ShieldCheck size={12} /> {places.length - soldOut - limited} fully available
        </Badge>
        {limited > 0 && <Badge tone="warning">{limited} limited availability</Badge>}
        {soldOut > 0 && <Badge tone="danger">{soldOut} sold out</Badge>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {places.map((place) => (
          <Card key={place.id} className="overflow-hidden">
            <div className="flex gap-3 p-4">
              <PlaceCover photo={place.photo} category={place.category} className="h-16 w-16 shrink-0 rounded-xl" iconSize={20} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-display text-sm font-bold">{place.name}</h3>
                  <Badge tone="teal">
                    <BadgeCheck size={11} /> Verified
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {place.category} · {place.area}
                </p>
                <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold">
                  <Star size={11} className="fill-[var(--color-warning)] text-[var(--color-warning)]" />
                  {place.rating}
                  <span className="font-normal text-[var(--color-ink-soft)]">({place.reviewCount.toLocaleString()})</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-[var(--color-border-soft)] border-t border-[var(--color-border-soft)] text-center">
              <MiniFact icon={Clock} value={formatMinutes(place.estimatedDurationMinutes)} />
              <MiniFact icon={Wallet} value={place.priceLabel.split(" ")[0]} />
              <MiniFact
                icon={MapPin}
                value={place.availability === "available" ? "Open" : place.availability === "limited" ? "Limited" : "Sold out"}
              />
            </div>
            <div className="border-t border-[var(--color-border-soft)] p-3">
              <LinkButton href={`/trips/${tripId}/places/${place.id}`} variant="ghost" size="sm" fullWidth>
                View full details
              </LinkButton>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MiniFact({ icon: Icon, value }: { icon: typeof Clock; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2.5">
      <Icon size={13} className="text-[var(--color-ink-soft)]" />
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}
