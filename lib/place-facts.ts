import type { Place, PlaceOpeningHours } from "./types";

export type OpeningHoursState = "AVAILABLE" | "UNAVAILABLE";
export type PlaceFreshness = "fresh" | "stale" | "unknown";

export function getPlaceFreshness(
  place: Pick<Place, "source" | "providerFetchedAt">,
  now = new Date(),
  maxAgeMs = 30 * 24 * 60 * 60 * 1000
): PlaceFreshness {
  if (place.source !== "google" || !place.providerFetchedAt) return "unknown";
  const fetchedAt = Date.parse(place.providerFetchedAt);
  if (!Number.isFinite(fetchedAt)) return "unknown";
  return now.getTime() - fetchedAt <= maxAgeMs ? "fresh" : "stale";
}

export function getPlaceFreshnessPresentation(place: Pick<Place, "source" | "providerFetchedAt">) {
  const freshness = getPlaceFreshness(place);
  return {
    fresh: { label: "Saved Google snapshot", tone: "success" as const },
    stale: { label: "Saved Google snapshot · stale", tone: "warning" as const },
    unknown: {
      label: place.source === "google" ? "Saved Google snapshot · age unknown" : "Saved planning data",
      tone: "neutral" as const,
    },
  }[freshness];
}

export function getOpeningHoursState(openingHours: PlaceOpeningHours[]): OpeningHoursState {
  return openingHours.some(({ day, hours }) => day.trim() && hours.trim()) ? "AVAILABLE" : "UNAVAILABLE";
}

export function getOpeningHoursLabel(openingHours: PlaceOpeningHours[]): string {
  return getOpeningHoursState(openingHours) === "AVAILABLE" ? "Hours listed" : "Hours unavailable";
}

export function getAvailabilityPresentation(availability: Place["availability"]) {
  return {
    available: { label: "Saved available", tone: "success" as const },
    limited: { label: "Saved limited", tone: "warning" as const },
    sold_out: { label: "Saved sold out", tone: "danger" as const },
    unknown: { label: "Not checked", tone: "neutral" as const },
  }[availability];
}

export function getPricePresentation(place: Pick<Place, "source" | "priceLabel">) {
  return place.source === "google"
    ? {
        title: "Google price level",
        value: place.priceLabel,
        description: "General affordability from Google. Not an admission or ticket price.",
      }
    : {
        title: "Curated cost note",
        value: place.priceLabel,
        description: "Static planning/demo information. Not live pricing.",
      };
}
