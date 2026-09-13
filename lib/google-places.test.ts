import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGooglePlace } from "./server/google/places";
import { getPlaceFreshness } from "./place-facts";

test("server Google normalization preserves authoritative identity and freshness", () => {
  const place = normalizeGooglePlace(
    {
      id: "abc",
      displayName: { text: "Museum" },
      formattedAddress: "1 Tokyo Street",
      location: { latitude: 35.68, longitude: 139.76 },
      types: ["museum"],
      rating: 4.5,
      userRatingCount: 12,
      priceLevel: "PRICE_LEVEL_MODERATE",
      regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] },
    },
    "Tokyo",
    new Date("2026-09-01T00:00:00Z")
  );

  assert.equal(place.id, "g-abc");
  assert.equal(place.googlePlaceId, "abc");
  assert.equal(place.rating, 4.5);
  assert.equal(place.estimatedDurationMinutes, 120);
  assert.equal(place.openingHours.length, 1);
  assert.equal(getPlaceFreshness(place, new Date("2026-09-15T00:00:00Z")), "fresh");
  assert.equal(getPlaceFreshness(place, new Date("2026-11-01T00:00:00Z")), "stale");
});
