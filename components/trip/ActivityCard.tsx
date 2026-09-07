import { Lock, MapPin, Star, UtensilsCrossed, Car, Coffee } from "lucide-react";
import type { ItineraryActivity, Place } from "@/lib/types";
import { PlaceCover } from "./CategoryIcon";
import { Badge } from "@/components/ui/Card";
import { formatMinutes } from "@/lib/utils";

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
}: {
  activity: ItineraryActivity;
  place?: Place | null;
  onClick?: () => void;
  selected?: boolean;
}) {
  const Icon = TYPE_ICON[activity.type];

  return (
    <div
      onClick={onClick}
      className={`flex gap-3.5 rounded-2xl border bg-white p-3.5 shadow-[var(--shadow-soft)] transition-all ${
        selected ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]" : "border-[var(--color-border)]"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {place ? (
        <PlaceCover photo={place.photo} category={place.category} className="h-20 w-20 shrink-0 rounded-xl sm:h-24 sm:w-24" iconSize={22} />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sand)] sm:h-24 sm:w-24">
          <Icon size={22} className="text-[var(--color-ink-soft)]" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-sm font-bold text-[var(--color-primary)]">{activity.time}</p>
            <h3 className="font-display text-[15px] font-bold">{place ? place.name : activity.label}</h3>
          </div>
          {activity.locked && (
            <Badge tone="violet">
              <Lock size={10} /> Locked
            </Badge>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-soft)]">
          <span>{formatMinutes(activity.durationMinutes)}</span>
          {activity.travelFromPrevMinutes > 0 && <span>🚶 {activity.travelFromPrevMinutes} min travel</span>}
          {activity.estimatedCost > 0 && <span>RM {activity.estimatedCost}</span>}
        </div>

        {place && (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--color-ink-soft)]">
            <span className="flex items-center gap-1 font-medium text-[var(--color-ink)]">
              <Star size={11} className="fill-[var(--color-warning)] text-[var(--color-warning)]" />
              {place.rating}
            </span>
            <span>{place.area}</span>
            {place.availability === "limited" && <Badge tone="warning">Book early</Badge>}
          </div>
        )}
      </div>
    </div>
  );
}
