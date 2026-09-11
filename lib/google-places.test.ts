import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGooglePlace } from "./server/google/places";
import { getPlaceFreshness } from "./place-facts";

test("server Google normalization preserves authoritative identity and freshness", () => {
  const place = normalizeGooglePlace(
    {
      place_id: "abc",
      name: "Museum",
      formatted_address: "1 Tokyo Street",
      geometry: { location: { lat: 35.68, lng: 139.76 } },
      types: ["museum"],
      rating: 4.5,
      user_ratings_total: 12,
      price_level: 2,
      opening_hours: { weekday_text: ["Monday: 9:00 AM – 5:00 PM"] },
    },
    "Tokyo",
    new Date("2026-09-01T00:00:00Z")
  );

  assert.equal(place.id, "g-abc");
  assert.equal(place.googlePlaceId, "abc");
  assert.equal(place.rating, 4.5);
  assert.equal(place.openingHours.length, 1);
  assert.equal(getPlaceFreshness(place, new Date("2026-09-15T00:00:00Z")), "fresh");
  assert.equal(getPlaceFreshness(place, new Date("2026-11-01T00:00:00Z")), "stale");
});
