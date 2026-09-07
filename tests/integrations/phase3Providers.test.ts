import { describe, expect, it, vi } from "vitest";
import { retryProvider } from "../../functions/src/integrations/retryProvider";
import { routeDepartureBucket, buildRouteCacheKey } from "../../functions/src/integrations/routeCacheKey";
import { fetchGoogleRouteData } from "../../functions/src/integrations/google/routes";
import { fetchGooglePlaceDetailsData } from "../../functions/src/integrations/google/placeDetails";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Phase 3 provider orchestration", () => {
  it("caps provider retries at three attempts", async () => {
    const operation = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(retryProvider(operation, { maxAttempts: 3 })).rejects.toThrow("down");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("uses a 15-minute route bucket and deterministic key", () => {
    const bucket = routeDepartureBucket({ date: "2026-10-05", departureMinute: 599 });
    expect(bucket).toEqual({ date: "2026-10-05", startMinute: 585 });
    const key = buildRouteCacheKey({
      origin: { lat: 3.1, lng: 101.6 },
      destination: { lat: 3.2, lng: 101.7 },
      transportMode: "TRANSIT",
      departureBucket: bucket,
    });
    expect(key).toContain("TRANSIT");
    expect(key).toContain("585");
  });

  it("retries Google Routes retryable failures and rounds duration upward to minutes", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(503, {}))
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(response(200, { routes: [{ duration: "601s" }] }));

    const route = await fetchGoogleRouteData({
      origin: { lat: 3.1, lng: 101.6 },
      destination: { lat: 3.2, lng: 101.7 },
      transportMode: "WALKING",
      departureDate: "2026-10-05",
      departureMinute: 599,
      tripTimezone: "Asia/Kuala_Lumpur",
      fetchImpl: fetchImpl as typeof fetch,
      keyProvider: () => "test-key",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(route.departureBucket.startMinute).toBe(585);
    expect(route.durationMinutes).toBe(11);
  });

  it("normalizes cross-midnight Google regular opening hours into half-open trip-local windows", async () => {
    const fetchImpl = vi.fn(async () => response(200, {
      id: "place-1",
      location: { latitude: 3.2, longitude: 101.7 },
      types: ["tourist_attraction"],
      timeZone: { id: "Asia/Kuala_Lumpur" },
      regularOpeningHours: {
        periods: [
          {
            open: { day: 1, hour: 18, minute: 0 },
            close: { day: 2, hour: 2, minute: 0 },
          },
        ],
      },
    }));

    const place = await fetchGooglePlaceDetailsData({
      placeId: "place-1",
      tripTimezone: "Asia/Kuala_Lumpur",
      tripStartDate: "2026-10-05",
      tripEndDate: "2026-10-06",
      fetchImpl: fetchImpl as typeof fetch,
      keyProvider: () => "test-key",
    });
    expect(place.visitWindows).toEqual([
      { date: "2026-10-05", startMinute: 1080, endMinute: 1440 },
      { date: "2026-10-06", startMinute: 0, endMinute: 120 },
    ]);
  });
});
