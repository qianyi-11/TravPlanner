import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getOrRefreshProviderSnapshot } from "../../functions/src/integrations/externalSnapshots";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = runWithEmulator ? describe : describe.skip;

const placeData = {
  placeId: "place-1",
  location: { lat: 3.1, lng: 101.6 },
  placeTypes: ["tourist_attraction"],
  visitWindows: [{ date: "2026-10-05", startMinute: 540, endMinute: 1080 }],
};

describeEmulator("Phase 3 external snapshot cache", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-external-snapshot-test" });
  });

  it("reuses fresh cache data, then records STALE fallback after TTL when refresh fails", async () => {
    const tripId = `trip-cache-${Date.now()}`;
    const cacheKey = "place-cache";
    await getFirestore().collection("trips").doc(tripId).set({ marker: true });
    const fetchData = vi.fn(async () => placeData);

    const first = await getOrRefreshProviderSnapshot({
      tripId,
      cacheKey,
      kind: "PLACE_DETAILS",
      provider: "GOOGLE_PLACES",
      source: "TEST",
      ttlMs: 1_000,
      fetchData,
      now: () => Timestamp.fromMillis(10_000),
    });
    expect(first.snapshot.freshness).toBe("FRESH");
    expect(fetchData).toHaveBeenCalledTimes(1);

    const cached = await getOrRefreshProviderSnapshot({
      tripId,
      cacheKey,
      kind: "PLACE_DETAILS",
      provider: "GOOGLE_PLACES",
      source: "TEST",
      ttlMs: 1_000,
      fetchData,
      now: () => Timestamp.fromMillis(10_500),
    });
    expect(cached.id).toBe(first.id);
    expect(fetchData).toHaveBeenCalledTimes(1);

    const failingFetch = vi.fn(async () => {
      throw new Error("provider down");
    });
    const stale = await getOrRefreshProviderSnapshot({
      tripId,
      cacheKey,
      kind: "PLACE_DETAILS",
      provider: "GOOGLE_PLACES",
      source: "TEST",
      ttlMs: 1_000,
      fetchData: failingFetch,
      now: () => Timestamp.fromMillis(12_000),
    });
    expect(stale.snapshot.freshness).toBe("STALE");
    expect(stale.snapshot.data).toEqual(placeData);
    expect(failingFetch).toHaveBeenCalledTimes(1);
  }, 20000);

  it("records UNAVAILABLE without data when no usable cache exists", async () => {
    const tripId = `trip-unavailable-${Date.now()}`;
    await getFirestore().collection("trips").doc(tripId).set({ marker: true });
    const unavailable = await getOrRefreshProviderSnapshot({
      tripId,
      cacheKey: "missing-place-cache",
      kind: "PLACE_DETAILS",
      provider: "GOOGLE_PLACES",
      source: "TEST",
      ttlMs: 1_000,
      fetchData: async () => { throw new Error("provider down"); },
      now: () => Timestamp.fromMillis(20_000),
    });
    expect(unavailable.snapshot.freshness).toBe("UNAVAILABLE");
    expect(unavailable.snapshot.data).toBeUndefined();
  }, 20000);
});
