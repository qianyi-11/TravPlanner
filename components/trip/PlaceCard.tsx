"use client";

import Link from "next/link";
import { Clock, MapPin, Star } from "lucide-react";
import type { Member, Place } from "@/lib/types";
import { PlaceCover } from "./CategoryIcon";
import { MemberStack } from "@/components/ui/Avatar";
import { cx } from "@/lib/utils";
import { getOpeningHoursLabel } from "@/lib/place-facts";

export function PlaceCard({
  place,
  footer,
  topRight,
  suggestedByMembers,
  rank,
  selected,
  onClick,
  detailsHref,
  className,
}: {
  place: Place;
  footer?: React.ReactNode;
  topRight?: React.ReactNode;
  suggestedByMembers?: Member[];
  rank?: number;
  selected?: boolean;
  onClick?: () => void;
  detailsHref?: string;
  className?: string;
}) {
  const nameEl = detailsHref ? (
    <Link href={detailsHref} className="hover:underline">
      {place.name}
    </Link>
  ) : (
    place.name
  );

  return (
    <div
      onClick={onClick}
      className={cx(
        "flex gap-3.5 rounded-2xl border bg-white p-3.5 shadow-[var(--shadow-soft)] transition-all",
        selected ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]" : "border-[var(--color-border)]",
        onClick && "cursor-pointer hover:shadow-[var(--shadow-card)]",
        className
      )}
    >
      <div className="relative shrink-0">
        <PlaceCover photo={place.photo} category={place.category} className="h-24 w-24 rounded-xl sm:h-28 sm:w-28" iconSize={26} />
        {rank && (
          <div className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ink)] font-display text-xs font-bold text-white shadow">
            #{rank}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[15px] font-bold text-[var(--color-ink)]">{nameEl}</h3>
            <p className="text-xs text-[var(--color-ink-soft)]">
              {place.category} · {place.area}
            </p>
          </div>
          {topRight}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-soft)]">
          <span className="flex items-center gap-1 font-semibold text-[var(--color-ink)]">
            <Star size={12} className="fill-[var(--color-warning)] text-[var(--color-warning)]" />
            {place.rating}
          </span>
          <span>{place.reviewCount.toLocaleString()} reviews</span>
          <span className="flex items-center gap-1">
            <MapPin size={11} /> {place.destination}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-medium text-[var(--color-ink-soft)]">{getOpeningHoursLabel(place.openingHours)}</span>
          <span className="flex items-center gap-1 text-[var(--color-ink-soft)]">
            <Clock size={11} /> ~{Math.round(place.estimatedDurationMinutes / 30) * 30 >= 60 ? `${Math.round(place.estimatedDurationMinutes / 60 * 10) / 10}h` : `${place.estimatedDurationMinutes}m`}
          </span>
        </div>

        <p className="mt-1.5 line-clamp-1 text-xs text-[var(--color-ink-soft)]">{place.description}</p>

        {suggestedByMembers && suggestedByMembers.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <MemberStack members={suggestedByMembers} max={3} size="xs" />
            <span className="text-xs text-[var(--color-ink-soft)]">
              {suggestedByMembers.length === 1
                ? `Suggested by ${suggestedByMembers[0].name}`
                : `Suggested by ${suggestedByMembers.length} members`}
            </span>
          </div>
        )}

        {footer && <div className="mt-3 flex items-center gap-2">{footer}</div>}
      </div>
    </div>
  );
}
