import { describe, expect, it } from "vitest";
import {
  createGooglePlacesResolver,
  PlaceResolutionError,
} from "../../functions/src/integrations/google/places";

const validPlace = {
  id: "ChIJtest",
  displayName: { text: "Kuala Lumpur" },
  formattedAddress: "Kuala Lumpur, Malaysia",
  location: { latitude: 3.139, longitude: 101.6869 },
  timeZone: { id: "Asia/Kuala_Lumpur" },
  types: ["locality", "political"],
};

describe("Google Places boundary", () => {
  it("normalizes only the requested fields", async () => {
    const resolver = createGooglePlacesResolver(
      async (_input, init) => {
        expect(init?.headers).toMatchObject({
          "X-Goog-Api-Key": "test-key",
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,timeZone",
        });
        expect(init?.signal).toBeDefined();
        return new Response(JSON.stringify({ ...validPlace, rating: 5 }), { status: 200 });
      },
      () => "test-key",
    );

    await expect(resolver("ChIJtest")).resolves.toEqual({
      placeId: "ChIJtest",
      name: "Kuala Lumpur",
      formattedAddress: "Kuala Lumpur, Malaysia",
      lat: 3.139,
      lng: 101.6869,
      timezone: "Asia/Kuala_Lumpur",
      placeTypes: ["locality", "political"],
    });
  });

  it.each([
    [404, "NOT_FOUND"],
  ])("maps non-retryable HTTP failure %s", async (status, reason) => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        return new Response("", { status });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).rejects.toMatchObject({ reason });
    expect(calls).toBe(1);
  });

  it("retries a network failure once", async () => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("network failure");
        return new Response(JSON.stringify(validPlace), { status: 200 });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).resolves.toMatchObject({ placeId: "ChIJtest", placeTypes: ["locality", "political"] });
    expect(calls).toBe(2);
  });

  it.each([429, 503])("retries HTTP %s once and succeeds", async status => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status })
          : new Response(JSON.stringify(validPlace), { status: 200 });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).resolves.toMatchObject({ placeId: "ChIJtest", placeTypes: ["locality", "political"] });
    expect(calls).toBe(2);
  });

  it("maps repeated retryable failures after one retry", async () => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        return new Response("", { status: 503 });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).rejects.toMatchObject({ reason: "EXTERNAL_DATA_UNAVAILABLE" });
    expect(calls).toBe(2);
  });

  it("maps deterministic client errors without retrying", async () => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        return new Response("", { status: 400 });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).rejects.toMatchObject({ reason: "EXTERNAL_DATA_UNAVAILABLE" });
    expect(calls).toBe(1);
  });

  it("rejects malformed provider facts without retrying", async () => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        return new Response("malformed", { status: 200 });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).rejects.toEqual(
      new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE"),
    );
    expect(calls).toBe(1);
  });

  it("rejects invalid timezones without retrying", async () => {
    let calls = 0;
    const resolver = createGooglePlacesResolver(
      async () => {
        calls += 1;
        return new Response(JSON.stringify({ ...validPlace, timeZone: { id: "Mars/Olympus" } }), { status: 200 });
      },
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).rejects.toMatchObject({ reason: "EXTERNAL_DATA_UNAVAILABLE" });
    expect(calls).toBe(1);
  });

  it("normalizes an absent provider types field to an empty list", async () => {
    const { types: _types, ...withoutTypes } = validPlace;
    const resolver = createGooglePlacesResolver(
      async () => new Response(JSON.stringify(withoutTypes), { status: 200 }),
      () => "test-key",
    );
    await expect(resolver("ChIJtest")).resolves.toMatchObject({ placeTypes: [] });
  });
});
