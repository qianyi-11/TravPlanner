"use client";

import type { Place, PlaceOpeningHours, PlaceReview } from "@/lib/types";
import { gradientFor } from "@/lib/utils";

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

function price(level: google.maps.places.PriceLevelString | null | undefined) {
  return {
    FREE: { level: 1, label: "Free" },
    INEXPENSIVE: { level: 1, label: "$" },
    MODERATE: { level: 2, label: "$$" },
    EXPENSIVE: { level: 3, label: "$$$" },
    VERY_EXPENSIVE: { level: 4, label: "$$$$" },
  }[level ?? "MODERATE"] ?? { level: 2, label: "$$" };
}

function guessArea(address: string | undefined, destination: string): string {
  if (!address) return destination;
  const parts = address.split(",").map((s) => s.trim());
  const withoutDestination = parts.filter(
    (p) => p && !p.toLowerCase().includes(destination.toLowerCase()) && !/^\d/.test(p)
  );
  return withoutDestination[0] || destination;
}

function toPlace(result: google.maps.places.Place, destination: string): Place {
  const id = `g-${result.id}`;
  const priceInfo = price(result.priceLevel);
  const photo = result.photos?.[0]?.getURI({ maxWidth: 800, maxHeight: 600 }) ?? gradientFor(id);

  return {
    id,
    source: "google",
    name: result.displayName ?? "Unnamed place",
    category: prettyCategory(result.types),
    area: guessArea(result.formattedAddress ?? undefined, destination),
    destination,
    coordinates: {
      lat: result.location?.lat() ?? 0,
      lng: result.location?.lng() ?? 0,
    },
    address: result.formattedAddress ?? "",
    photo,
    rating: result.rating ?? 0,
    reviewCount: result.userRatingCount ?? 0,
    priceLevel: priceInfo.level as Place["priceLevel"],
    priceLabel: priceInfo.label,
    description: result.editorialSummary ?? "",
    openingHours: (result.regularOpeningHours?.weekdayDescriptions ?? []).map((line): PlaceOpeningHours => {
      const idx = line.indexOf(":");
      return idx === -1
        ? { day: line, hours: "" }
        : { day: line.slice(0, idx).trim(), hours: line.slice(idx + 1).trim() };
    }),
    // Legacy import snapshot only; UI uses the saved weekly schedule.
    isOpenNow: false,
    closesAt: undefined,
    estimatedDurationMinutes: 60,
    reviews: (result.reviews ?? []).slice(0, 5).map((review, i): PlaceReview => ({
      id: `${id}-review-${i}`,
      author: review.authorAttribution?.displayName ?? "Google user",
      rating: review.rating ?? 0,
      text: review.text ?? "",
      date: review.relativePublishTimeDescription ?? "",
    })),
    availability: "unknown",
    suggestedBy: [],
    voteCount: 0,
    votedBy: [],
  };
}

/** Live text search against Google Places, scoped loosely to a destination. */
export async function searchGooglePlaces(query: string, destination: string): Promise<Place[]> {
  if (!query.trim()) return [];
  try {
    const { Place: GooglePlace } = await google.maps.importLibrary("places");
    const { places } = await GooglePlace.searchByText({
      textQuery: `${query} in ${destination}`,
      fields: [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "rating",
        "userRatingCount",
        "priceLevel",
        "regularOpeningHours",
        "editorialSummary",
        "photos",
        "reviews",
      ],
      maxResultCount: 8,
    });
    return places.map((place) => toPlace(place, destination));
  } catch {
    return [];
  }
}
