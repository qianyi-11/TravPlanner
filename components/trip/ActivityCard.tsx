"use client";

import Link from "next/link";
import { ArrowUpRight, Car, Clock, Coffee, Lock, MapPin, Star, UtensilsCrossed } from "lucide-react";
import type { ItineraryActivity, Place } from "@/lib/types";
import { PlaceCover } from "./CategoryIcon";
import { Badge } from "@/components/ui/Card";
import { cx, formatMinutes } from "@/lib/utils";

const TYPE_ICON = {
  meal: UtensilsCrossed,
  transit: Car,
  free: Coffee,
  place: MapPin,
};

export function ActivityCard({
  activity,
  place,
  onClick,
  selected,
  detailsHref,
}: {
  activity: ItineraryActivity;
  place?: Place | null;
  onClick?: () => void;
  selected?: boolean;
  detailsHref?: string;
}) {
  const Icon = TYPE_ICON[activity.type];

  if (!place) {
    return (
      <div
        onClick={onClick}
        className={cx(
          "flex items-center gap-3.5 rounded-2xl border bg-white p-3.5 shadow-[var(--shadow-soft)] transition-all",
          selected ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]" : "border-[var(--color-border)]",
          onClick && "cursor-pointer"
        )}
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sand)]">
          <Icon size={20} className="text-[var(--color-ink-soft)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-bold text-[var(--color-primary)]">{activity.time}</p>
          <h3 className="truncate font-display text-[15px] font-bold">{activity.label}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-soft)]">
            <span>{formatMinutes(activity.durationMinutes)}</span>
            {activity.estimatedCost > 0 && <span>RM {activity.estimatedCost}</span>}
          </div>
        </div>
        {activity.locked && (
          <Badge tone="violet">
            <Lock size={10} /> Locked
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cx(
        "overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-soft)] transition-all",
        selected ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]" : "border-[var(--color-border)]",
        onClick && "cursor-pointer"
      )}
    >
      <div className="relative">
        <PlaceCover photo={place.photo} category={place.category} className="h-44 w-full sm:h-48" iconSize={36} />
        <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <Clock size={11} /> {formatMinutes(activity.durationMinutes)}
        </span>
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-display text-xs font-bold text-[var(--color-ink)] backdrop-blur-sm">
          {activity.time}
        </span>
        {activity.locked && (
          <span className="absolute right-3 top-3">
            <Badge tone="violet">
              <Lock size={10} /> Locked
            </Badge>
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-bold leading-snug">{place.name}</h3>
          {detailsHref && (
            <Link
              href={detailsHref}
              onClick={(e) => e.stopPropagation()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]"
            >
              <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{place.address}</p>
        <p className="mt-2 line-clamp-2 text-sm text-[var(--color-ink-soft)]">{place.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1 font-semibold text-[var(--color-ink)]">
            <Star size={11} className="fill-[var(--color-warning)] text-[var(--color-warning)]" />
            {place.rating}
          </span>
          <span className="text-[var(--color-ink-soft)]">{place.area}</span>
          {activity.estimatedCost > 0 && <span className="text-[var(--color-ink-soft)]">RM {activity.estimatedCost}</span>}
          {place.availability === "limited" && <Badge tone="warning">Book early</Badge>}
        </div>
      </div>
    </div>
  );
}
