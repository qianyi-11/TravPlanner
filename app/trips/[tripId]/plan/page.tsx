"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import {
  CalendarRange,
  ChevronDown,
  ListTree,
  MapPinned,
  Receipt,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { usePlannerStore } from "@/lib/store";
import { ItineraryTimeline } from "@/components/trip/ItineraryTimeline";
import { MapView } from "@/components/trip/MapView";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { BudgetCard } from "@/components/trip/BudgetCard";
import { PressureRadar } from "@/components/trip/PressureRadar";
import { Badge, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { formatDateRange, daysBetween, cx, formatWeekday } from "@/lib/utils";
import { EmptyState } from "@/components/ui/States";
import { buildConsensus } from "@/lib/group-consensus";
import { getActivePlanPlaceIds } from "@/lib/plan-places";

const TABS = [
  { key: "itinerary", label: "Itinerary", icon: ListTree },
  { key: "map", label: "Map", icon: MapPinned },
  { key: "budget", label: "Budget", icon: Wallet },
  { key: "bookings", label: "Bookings", icon: Ticket },
  { key: "places", label: "Places", icon: CalendarRange },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function FinalPlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const placesMap = usePlannerStore((s) => s.places);
  const tripPlacesMap = usePlannerStore((s) => s.tripPlaces[tripId]);
  const membersMap = usePlannerStore((s) => s.members);
  const [tab, setTab] = useState<TabKey>("itinerary");
  const [openDay, setOpenDay] = useState(0);

  const activePlanPlaces = useMemo(() => {
    return trip ? getActivePlanPlaceIds(trip).map((id) => tripPlacesMap?.[id] ?? placesMap[id]).filter(Boolean) : [];
  }, [trip, tripPlacesMap, placesMap]);

  if (!trip) notFound();

  const tripMembers = trip.memberIds.map((id) => membersMap[id]).filter(Boolean);
  const planConsensus = buildConsensus({ members: tripMembers, candidates: activePlanPlaces, capacity: activePlanPlaces.length });
  const unrepresentedNames = planConsensus.memberRepresentation
    .filter((member) => member.selectedMatchCount === 0)
    .map((member) => membersMap[member.memberId]?.name ?? member.memberId);
  const days = daysBetween(trip.startDate, trip.endDate);
  const activityCount = trip.itinerary.reduce((s, d) => s + d.activities.filter((a) => a.type === "place").length, 0);

  const bookingItems = activePlanPlaces.filter((p) => p.availability === "limited" || p.availability === "sold_out");

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8" style={{ background: trip.coverColor }}>
        <p className="text-sm font-medium text-white/70">{trip.destinations.join(" · ")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{trip.name}</h1>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          <span>{trip.memberIds.length} travelers</span>
          <span>{days} days</span>
          <span>{activityCount} activities</span>
        </div>
      </div>

      <Card className="mt-4 flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]">
          <Users size={18} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Group Representation</p>
          <p className="font-display text-base font-bold">
            {planConsensus.representedMemberCount} / {tripMembers.length} travellers represented · {planConsensus.representationPercent}%
          </p>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {unrepresentedNames.length
              ? `${unrepresentedNames.join(", ")} currently ${unrepresentedNames.length === 1 ? "has" : "have"} no strongly matched activity.`
              : "The plan includes at least one supported or preference-matched activity for every traveller."}
          </p>
        </div>
      </Card>

      {trip.rescueEvents.length > 0 && (
        <div className="mt-4">
          <LinkButton href={`/trips/${tripId}/live`} variant="outline">
            Open Trip Rescue
          </LinkButton>
        </div>
      )}

      <div className="mt-5 flex gap-1.5 overflow-x-auto scrollbar-none rounded-2xl border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-soft)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === t.key ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]"
            )}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "itinerary" &&
          (trip.itinerary.length === 0 ? (
            <EmptyState icon={ListTree} title="No itinerary yet" />
          ) : (
            <div className="space-y-3">
              {trip.itinerary.map((day, i) => (
                <Card key={day.day} className="overflow-hidden">
                  <button
                    onClick={() => setOpenDay(openDay === i ? -1 : i)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                        Day {day.day} · {formatWeekday(day.date)}
                      </p>
                      <p className="font-display text-base font-bold">{day.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="neutral">{day.activities.length} stops</Badge>
                      <ChevronDown size={16} className={cx("transition-transform", openDay === i && "rotate-180")} />
                    </div>
                  </button>
                  {openDay === i && (
                    <div className="border-t border-[var(--color-border-soft)] p-4">
                      <ItineraryTimeline activities={day.activities} places={placesMap} transport={trip.transport} tripId={tripId} />
                    </div>
                  )}
                </Card>
              ))}
              <LinkButton href={`/trips/${tripId}/itinerary`} variant="outline" fullWidth>
                Open full itinerary view
              </LinkButton>
            </div>
          ))}

        {tab === "map" &&
          (activePlanPlaces.length > 0 ? (
            <div style={{ height: 480 }}>
              <MapView places={activePlanPlaces} />
            </div>
          ) : (
            <EmptyState icon={MapPinned} title="No route yet" />
          ))}

        {tab === "budget" && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <BudgetCard trip={trip} />
              <PressureRadar pressure={trip.pricePressure} />
            </div>
            <LinkButton href={`/trips/${tripId}/split-bill`} variant="outline" icon={<Receipt size={15} />}>
              Split a Bill
            </LinkButton>
          </div>
        )}

        {tab === "bookings" && (
          <div className="space-y-3">
            {bookingItems.length === 0 ? (
              <EmptyState icon={Ticket} title="No saved booking alerts" description="No current-plan place is marked limited or sold out." />
            ) : (
              bookingItems.map((p) => (
                <Card key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">{p.priceLabel}</p>
                  </div>
                  <Badge
                    tone={p.availability === "sold_out" ? "danger" : p.availability === "limited" ? "warning" : "neutral"}
                  >
                    {p.availability === "sold_out" ? "Saved sold out" : "Saved limited"}
                  </Badge>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === "places" && (
          <div className="space-y-3">
            {activePlanPlaces.map((p) => (
              <PlaceCard key={p.id} place={p} detailsHref={`/trips/${tripId}/places/${p.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
