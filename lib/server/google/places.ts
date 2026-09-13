import { gradientFor } from "@/lib/utils";
import { estimateVisitDuration } from "@/lib/place-duration";
import type { Place, PlaceOpeningHours, PlaceReview } from "@/lib/types";
import { ApiError } from "../api-error";
import { getServerEnv } from "../env";

type GooglePlaceResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  editorialSummary?: { text?: string };
  photos?: Array<{ name?: string }>;
  reviews?: Array<{
    authorAttribution?: { displayName?: string };
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
  }>;
};

type GoogleErrorResponse = { error?: { message?: string; status?: string } };

const SKIP_TYPES = new Set(["point_of_interest", "establishment", "premise", "political", "geocode"]);

function category(types: string[] | undefined) {
  const value = types?.find((type) => !SKIP_TYPES.has(type));
  return value ? value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") : "Place";
}

function price(level: string | undefined) {
  return {
    PRICE_LEVEL_FREE: { level: 1, label: "Free" },
    PRICE_LEVEL_INEXPENSIVE: { level: 1, label: "$" },
    PRICE_LEVEL_MODERATE: { level: 2, label: "$$" },
    PRICE_LEVEL_EXPENSIVE: { level: 3, label: "$$$" },
    PRICE_LEVEL_VERY_EXPENSIVE: { level: 4, label: "$$$$" },
  }[level ?? "PRICE_LEVEL_MODERATE"] ?? { level: 2, label: "$$" };
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
  const googlePlaceId = result.id;
  const name = result.displayName?.text?.trim();
  const address = result.formattedAddress?.trim();
  const lat = result.location?.latitude;
  const lng = result.location?.longitude;
  if (!googlePlaceId || !name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(502, "GOOGLE_PLACE_INVALID", "Google returned an incomplete place");
  }

  const id = `g-${googlePlaceId}`;
  const priceInfo = price(result.priceLevel);
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
    reviewCount: Number.isFinite(result.userRatingCount) ? result.userRatingCount! : 0,
    priceLevel: priceInfo.level as Place["priceLevel"],
    priceLabel: priceInfo.label,
    description: result.editorialSummary?.text ?? "",
    openingHours: hours(result.regularOpeningHours?.weekdayDescriptions),
    isOpenNow: result.currentOpeningHours?.openNow === true,
    estimatedDurationMinutes: estimateVisitDuration(category(result.types)),
    reviews: (result.reviews ?? []).slice(0, 5).map(
      (review, index): PlaceReview => ({
        id: `${id}-review-${index}`,
        author: review.authorAttribution?.displayName ?? "Google user",
        rating: review.rating ?? 0,
        text: review.text?.text ?? "",
        date: review.relativePublishTimeDescription ?? "",
      })
    ),
    availability: "unknown" as const,
    suggestedBy: [],
    voteCount: 0,
    votedBy: [],
    photoRef: result.photos?.[0]?.name,
  } satisfies Place & { photoRef?: string };
}

export async function fetchGooglePlace(googlePlaceId: string, destination: string) {
  const apiKey = getServerEnv().googlePlacesServerApiKey;
  if (!apiKey) throw new ApiError(503, "GOOGLE_PLACES_NOT_CONFIGURED", "Google Places server access is not configured");

  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`);
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,regularOpeningHours,currentOpeningHours,editorialSummary,photos,reviews",
      },
    });
  } catch {
    throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", "Google Places could not be reached");
  }
  const payload = (await response.json().catch(() => null)) as GooglePlaceResult | GoogleErrorResponse | null;
  if (!response.ok || !payload || !("id" in payload)) {
    if (response.status === 404 || (payload && "error" in payload && payload.error?.status === "NOT_FOUND")) {
      throw new ApiError(404, "GOOGLE_PLACE_NOT_FOUND", "Google place not found");
    }
    throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", payload && "error" in payload ? payload.error?.message ?? "Google Places returned an error" : "Google Places returned an error");
  }
  return normalizeGooglePlace(payload, destination);
}

export async function fetchGooglePlacePhoto(photoName: string) {
  const apiKey = getServerEnv().googlePlacesServerApiKey;
  if (!apiKey) throw new ApiError(503, "GOOGLE_PLACES_NOT_CONFIGURED", "Google Places server access is not configured");
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) throw new ApiError(400, "PLACE_PHOTO_INVALID", "Google photo name is invalid");

  const path = photoName.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://places.googleapis.com/v1/${path}/media`);
  url.searchParams.set("maxWidthPx", "1200");
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", redirect: "follow", headers: { "X-Goog-Api-Key": apiKey } });
  } catch {
    throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", "Google Places photo could not be reached");
  }
  if (!response.ok) throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", "Google Places photo returned an error");
  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith("image/")) throw new ApiError(503, "GOOGLE_PLACES_UNAVAILABLE", "Google Places returned an invalid photo");
  return { body: response.body, contentType };
}
