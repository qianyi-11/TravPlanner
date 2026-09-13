import assert from "node:assert/strict";
import test from "node:test";
import { estimateTravelMinutes, haversineKm } from "./geo";

const origin = { lat: 35, lng: 139 };

test("haversine distance and travel estimates keep the current bounds", () => {
  assert.equal(haversineKm(origin, origin), 0);
  assert.equal(estimateTravelMinutes(origin, { lat: 35.0001, lng: 139 }, "Walking"), 10);
  assert.equal(estimateTravelMinutes(origin, { lat: 36, lng: 139 }, "Walking"), 90);
});

test("invalid coordinates use the fixed fallback", () => {
  assert.equal(estimateTravelMinutes({ lat: 0, lng: 0 }, origin, "Car"), 20);
  assert.equal(estimateTravelMinutes({ lat: Number.NaN, lng: 139 }, origin, "Taxi"), 20);
});

test("transport modes use their current speed estimates", () => {
  const destination = { lat: 35.07, lng: 139 };
  assert.deepEqual(
    (["Walking", "Public Transport", "Car", "Taxi", "Mixed"] as const).map((mode) =>
      estimateTravelMinutes(origin, destination, mode)
    ),
    [90, 25, 20, 20, 30]
  );
});
