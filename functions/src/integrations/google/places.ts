import { defineSecret } from "firebase-functions/params";

export interface NormalizedPlace {
  placeId: string;
  name: string;
  formattedAddress?: string;
  lat: number;
  lng: number;
  timezone: string;
  placeTypes: string[];
}

export type PlaceResolver = (placeId: string) => Promise<NormalizedPlace>;
export const GOOGLE_MAPS_API_KEY = defineSecret("GOOGLE_MAPS_API_KEY");

export class PlaceResolutionError extends Error {
  constructor(public readonly reason: "NOT_FOUND" | "EXTERNAL_DATA_UNAVAILABLE") {
    super(reason);
    this.name = "PlaceResolutionError";
  }
}

type KeyProvider = () => string;

export function createGooglePlacesResolver(
  fetchImpl: typeof fetch = fetch,
  keyProvider: KeyProvider = () => GOOGLE_MAPS_API_KEY.value(),
): PlaceResolver {
  return async (placeId: string): Promise<NormalizedPlace> => {
    if (!placeId.trim()) throw new PlaceResolutionError("NOT_FOUND");

    let key: string;
    try {
      key = keyProvider();
      if (!key) throw new Error("Missing Google Places API key");
    } catch {
      throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
    }
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchImpl(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          {
            method: "GET",
            headers: {
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,timeZone",
            },
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch {
        if (attempt === 0) continue;
        throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
      }

      if (response.status === 404) throw new PlaceResolutionError("NOT_FOUND");
      if (response.ok) break;
      if (attempt === 0 && [429, 500, 502, 503, 504].includes(response.status)) continue;
      throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
    }

    if (!response) {
      throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
    }

    return normalizePlace(body);
  };
}

function normalizePlace(body: unknown): NormalizedPlace {
  if (!isRecord(body)) throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
  const displayName = isRecord(body.displayName) ? body.displayName.text : undefined;
  const formattedAddress = body.formattedAddress;
  const location = isRecord(body.location) ? body.location : undefined;
  const timeZone = isRecord(body.timeZone) ? body.timeZone.id : undefined;
  const types = body.types;

  if (
    typeof body.id !== "string" || !body.id ||
    typeof displayName !== "string" || !displayName.trim() ||
    (formattedAddress !== undefined && (typeof formattedAddress !== "string" || !formattedAddress.trim())) ||
    typeof location?.latitude !== "number" ||
    typeof location.longitude !== "number" ||
    !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 ||
    !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180 ||
    typeof timeZone !== "string" || !isRecognizedTimezone(timeZone) ||
    (types !== undefined && (!Array.isArray(types) || !types.every(type => typeof type === "string" && type.trim())))
  ) {
    throw new PlaceResolutionError("EXTERNAL_DATA_UNAVAILABLE");
  }

  return {
    placeId: body.id,
    name: displayName.trim(),
    ...(formattedAddress === undefined ? {} : { formattedAddress: formattedAddress.trim() }),
    lat: location.latitude,
    lng: location.longitude,
    timezone: timeZone,
    placeTypes: types === undefined ? [] : types.map(type => type.trim()),
  };
}

function isRecognizedTimezone(value: string): boolean {
  try {
    return Boolean(new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let activeResolver: PlaceResolver = createGooglePlacesResolver();

export function resolvePlace(placeId: string): Promise<NormalizedPlace> {
  return activeResolver(placeId);
}

export function setPlaceResolverForTests(resolver: PlaceResolver): () => void {
  const previous = activeResolver;
  activeResolver = resolver;
  return () => {
    activeResolver = previous;
  };
}
