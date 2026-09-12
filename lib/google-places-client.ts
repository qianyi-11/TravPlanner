"use client";

import type { Place, PlaceOpeningHours, PlaceReview } from "@/lib/types";
import { gradientFor } from "@/lib/mock-data";
import { estimateVisitDuration } from "@/lib/utils";

let serviceEl: HTMLDivElement | null = null;
function getService(): google.maps.places.PlacesService {
  if (!serviceEl) serviceEl = document.createElement("div");
  return new google.maps.places.PlacesService(serviceEl);
}

const SKIP_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "premise",
  "political",
  "geocode",
]);

function prettyCategory(types?: string[]): string {
  const t = types?.find((x) => !SKIP_TYPES.has(x));
  if (!t) return "Place";
  return t
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function priceLabelFor(level: number): string {
  return ["Free", "$", "$$", "$$$", "$$$$"][level] ?? "$$";
}

/**
 * Pull a city out of a formatted address when the trip hasn't named one yet.
 * "…Asakusa, Taito City, Tokyo 111-0032, Japan" → "Tokyo"
 *
 * Prefers a "<postcode> <City>" segment when one exists (common in Malaysian,
 * Japanese and many other addresses) — that's more reliable than a fixed
 * position, since some addresses carry an extra state/territory segment
 * after the city ("...Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur,
 * Malaysia") that would otherwise get picked up instead.
 */
export function guessDestination(address: string | undefined): string {
  if (!address) return "Unknown";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    // Requires a real postcode shape (4-6 digits + a space before the city) so
    // a house/unit number glued to a letter — "204A, Jln Ampang" — doesn't match.
    const match = part.match(/^\d{4,6}\s+(.+)$/);
    if (match && match[1]) return match[1].trim();
  }

  if (parts.length < 2) return parts[0] ?? "Unknown";
  const city = parts[parts.length - 2];
  return city.replace(/\d{3,}/g, "").trim() || parts[parts.length - 1];
}

function guessArea(address: string | undefined, destination: string): string {
  if (!address) return destination;
  const parts = address.split(",").map((s) => s.trim());
  const withoutDestination = parts.filter(
    (p) => p && !p.toLowerCase().includes(destination.toLowerCase()) && !/^\d/.test(p)
  );
  return withoutDestination[0] || destination;
}

function isOpenNow(hours?: google.maps.places.PlaceOpeningHours): boolean {
  if (!hours) return true;
  if (typeof hours.isOpen === "function") {
    try {
      return hours.isOpen() ?? true;
    } catch {
      return true;
    }
  }
  return (hours as unknown as { open_now?: boolean }).open_now ?? true;
}

// `editorial_summary` is returned by the Places API when requested but isn't
// modeled in @types/google.maps' PlaceResult — augment locally.
type PlaceResultWithSummary = google.maps.places.PlaceResult & {
  editorial_summary?: { overview?: string };
};

function toPlace(result: PlaceResultWithSummary, destinationHint?: string): Place {
  const id = `g-${result.place_id}`;
  const destination = destinationHint || guessDestination(result.formatted_address);
  const priceLevel = Math.min(4, Math.max(1, (result.price_level ?? 2) + (result.price_level === 0 ? 1 : 0)));
  const gallery = (result.photos ?? [])
    .slice(0, 6)
    .map((p) => p.getUrl({ maxWidth: 1000, maxHeight: 700 }))
    .filter(Boolean);
  const photo = gallery[0] ?? gradientFor(id);
  const category = prettyCategory(result.types);

  return {
    id,
    name: result.name ?? "Unnamed place",
    category,
    area: guessArea(result.formatted_address, destination),
    destination,
    coordinates: {
      lat: result.geometry?.location?.lat() ?? 0,
      lng: result.geometry?.location?.lng() ?? 0,
    },
    address: result.formatted_address ?? "",
    photo,
    photos: gallery.length > 0 ? gallery : undefined,
    rating: result.rating ?? 0,
    reviewCount: result.user_ratings_total ?? 0,
    priceLevel: priceLevel as Place["priceLevel"],
    priceLabel: priceLabelFor(result.price_level ?? 2),
    description: result.editorial_summary?.overview ?? "",
    openingHours: (result.opening_hours?.weekday_text ?? []).map((line): PlaceOpeningHours => {
      const idx = line.indexOf(":");
      return idx === -1
        ? { day: line, hours: "" }
        : { day: line.slice(0, idx).trim(), hours: line.slice(idx + 1).trim() };
    }),
    isOpenNow: isOpenNow(result.opening_hours),
    closesAt: undefined,
    estimatedDurationMinutes: estimateVisitDuration(category),
    reviews: (result.reviews ?? []).slice(0, 5).map(
      (r, i): PlaceReview => ({
        id: `${id}-review-${i}`,
        author: r.author_name ?? "Google user",
        rating: r.rating ?? 0,
        text: r.text ?? "",
        date: r.relative_time_description ?? "",
      })
    ),
    availability: "available",
    suggestedBy: [],
    voteCount: 0,
    votedBy: [],
  };
}

/**
 * Live text search against Google Places. Scoped loosely to a destination when
 * the trip has one; otherwise it's a plain open search, so a group that hasn't
 * decided where to go can still look anywhere.
 */
export function searchGooglePlaces(query: string, destination?: string): Promise<Place[]> {
  return new Promise((resolve) => {
    if (!query.trim()) return resolve([]);
    const service = getService();
    service.textSearch(
      { query: destination ? `${query} in ${destination}` : query },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
          resolve([]);
          return;
        }
        resolve(results.slice(0, 8).map((r) => toPlace(r, destination)));
      }
    );
  });
}

const DETAIL_FIELDS = [
  "place_id",
  "name",
  "formatted_address",
  "geometry",
  "rating",
  "user_ratings_total",
  "price_level",
  "opening_hours",
  "photos",
  "types",
  "editorial_summary",
  "reviews",
];

/** Fetches richer fields (hours, description, reviews) for one place right before it's saved. */
export function enrichGooglePlace(placeId: string, destination?: string): Promise<Place | null> {
  return new Promise((resolve) => {
    const service = getService();
    service.getDetails({ placeId, fields: DETAIL_FIELDS }, (result, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !result) {
        resolve(null);
        return;
      }
      resolve(toPlace(result, destination));
    });
  });
}
