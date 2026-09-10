import assert from "node:assert/strict";
import test from "node:test";
import { getAvailabilityPresentation, getOpeningHoursLabel, getOpeningHoursState, getPricePresentation } from "./place-facts";

test("weekly hours availability ignores the legacy current-status snapshot", () => {
  const legacyOpenPlace = { openingHours: [], isOpenNow: true };
  assert.equal(getOpeningHoursState([]), "UNAVAILABLE");
  assert.equal(getOpeningHoursState([{ day: "Monday", hours: " " }]), "UNAVAILABLE");
  assert.equal(getOpeningHoursState([{ day: "Monday", hours: "9:00–17:00" }]), "AVAILABLE");
  assert.equal(getOpeningHoursLabel(legacyOpenPlace.openingHours), "Hours unavailable");
  assert.equal(getOpeningHoursLabel([{ day: "Daily", hours: "24 hours" }]), "Hours listed");
});

test("availability labels preserve all four saved states", () => {
  assert.equal(getAvailabilityPresentation("available").label, "Saved available");
  assert.equal(getAvailabilityPresentation("limited").label, "Saved limited");
  assert.equal(getAvailabilityPresentation("sold_out").label, "Saved sold out");
  assert.equal(getAvailabilityPresentation("unknown").label, "Not checked");
});

test("price presentation distinguishes Google affordability from curated costs", () => {
  const google = getPricePresentation({ source: "google", priceLabel: "$$" });
  assert.equal(google.title, "Google price level");
  assert.match(google.description, /affordability/);
  assert.match(google.description, /not an admission or ticket price/i);
  assert.equal(getPricePresentation({ source: "catalog", priceLabel: "¥3,800" }).title, "Curated cost note");
});
