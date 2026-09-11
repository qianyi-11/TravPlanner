import { gradientFor } from "@/lib/mock-data";
import type { Place, PlaceOpeningHours, PlaceReview } from "@/lib/types";
import { ApiError } from "../api-error";
import { getServerEnv } from "../env";

type GooglePlaceResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  opening_hours?: { open_now?: boolean; weekday_text?: string[] };
  editorial_summary?: { overview?: string };
  photos?: Array<{ photo_reference?: string }>;
  reviews?: Array<{ author_name?: string; rating?: number; text?: string; relative_time_description?: string }>;
};

type GoogleResponse = { status?: string; error_message?: string; result?: GooglePlaceResult };

const SKIP_TYPES = new Set(["point_of_interest", "establishment", "premise", "political", "geocode"]);

function category(types: string[] | undefined) {
  const value = types?.find((type) => !SKIP_TYPES.has(type));
  return value ? value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") : "Place";
}

function priceLabel(level: number | undefined) {
  return ["Free", "$", "$$", "$$$", "$$$$"][Math.min(4, Math.max(0, level ?? 2))] ?? "$$";
}

function area(address: string, destination: string) {
  const parts = address.split(",").map((part) => part.trim());
  return parts.find((part) => part && !part.toLowerCase().includes(destination.toLowerCase()) && !/^\d/.test(part)) || destination;
}

function hours(lines: string[] | undefined): PlaceOpeningHours[] {
  return (lines ?? []).map((line) => {
    const index = line.indexOf(":");
    return index < 0 ? { day: line, hours: "" } : { day: line.slice(0, index).trim(), hours: line.slice(index + 1).trim() };
  });
}

export function normalizeGooglePlace(result: GooglePlaceResult, destination: string, fetchedAt = new Date()) {
  const googlePlaceId = result.place_id;
  const name = result.name?.trim();
  const address = result.formatted_address?.trim();
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (!googlePlaceId || !name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(502, "GOOGLE_PLACE_INVALID", "Google returned an incomplete place");
  }

  const id = `g-${googlePlaceId}`;
  const level = Math.min(4, Math.max(0, result.price_level ?? 2));
  return {
    id,
    source: "google" as const,
    googlePlaceId,
    providerFetchedAt: fetchedAt.toISOString(),
    name,
    category: category(result.types),
    area: area(address, destination),
    destination,
    coordinates: { lat: lat!, lng: lng! },
    address,
    photo: gradientFor(id),
    rating: Number.isFinite(result.rating) ? result.rating! : 0,
    reviewCount: Number.isFinite(result.user_ratings_total) ? result.user_ratings_total! : 0,
    priceLevel: (level === 0 ? 1 : level) as Place["priceLevel"],
    priceLabel: priceLabel(level),
    description: result.editorial_summary?.overview ?? "",
    openingHours: hours(result.opening_hours?.weekday_text),
    isOpenNow: result.opening_hours?.open_now === true,
    estimatedDurationMinutes: 60,
    reviews: (result.reviews ?? []).slice(0, 5).map(
      (review, index): PlaceReview => ({
        id: `${id}-review-${index}`,
        author: review.author_name ?? "Google user",
        rating: review.rating ?? 0,
        text: review.text ?? "",
        date: review.relative_time_description ?? "",
      })
    ),
    availability: "unknown" as const,
    suggestedBy: [],
    voteCount: 0,
    votedBy: [],
    photoRef: result.photos?.[0]?.photo_reference,
  } satisfies Place & { photoRef?: string };
}

export async function fetchGooglePlace(googlePlaceId: string, destination: string) {
  const apiKey = getServerEnv().googlePlacesServerApiKey;
  if (!apiKey) throw new ApiError(503, "GOOGLE_PLACES_NOT_CONFIGURED", "Google Places server access is not configured");

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", googlePlaceId);
  url.searchParams.set("fields", "place_id,name,formatted_address,geometry,types,rating,user_ratings_total,price_level,opening_hours,editorial_summary,photos,reviews");
  url.searchParams.set("key", apiKey);
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", "Google Places could not be reached");
  }
  if (!response.ok) throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", "Google Places returned an error");

  const payload = (await response.json().catch(() => null)) as GoogleResponse | null;
  if (!payload || payload.status !== "OK" || !payload.result) {
    if (payload?.status === "ZERO_RESULTS" || payload?.status === "NOT_FOUND") {
      throw new ApiError(404, "GOOGLE_PLACE_NOT_FOUND", "Google place not found");
    }
    throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", payload?.error_message ?? "Google Places returned an error");
  }
  return normalizeGooglePlace(payload.result, destination);
}
