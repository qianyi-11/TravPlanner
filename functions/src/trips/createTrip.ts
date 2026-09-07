import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest, type CallableResponse } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  createTripInputSchema,
  createTripResultSchema,
  externalSnapshotSchema,
  tripDocumentSchema,
  tripMemberDocumentSchema,
  tripMembershipProjectionSchema,
  type CreateTripInput,
} from "@travel-planner/shared";
import { validateEffectiveTripSetup } from "@travel-planner/shared";
import {
  authError,
  getCallerMemberProfile,
  requireAuth,
} from "../auth";
import {
  GOOGLE_MAPS_API_KEY,
  PlaceResolutionError,
  resolvePlace,
  type NormalizedPlace,
  type PlaceResolver,
} from "../integrations/google/places";
import { generateInviteToken, hashInviteToken } from "../membership/inviteToken";

const inviteDocumentSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  createdAt: z.unknown(),
  resetAt: z.unknown().optional(),
});

export async function createTripHandler(
  request: CallableRequest<unknown>,
  _response?: CallableResponse<unknown>,
): Promise<{ tripId: string; inviteToken: string }> {
  return createTripHandlerWithResolver(request, resolvePlace);
}

export async function createTripHandlerWithResolver(
  request: CallableRequest<unknown>,
  placeResolver: PlaceResolver,
): Promise<{ tripId: string; inviteToken: string }> {
  const uid = requireAuth(request);
  const parsed = createTripInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw authError("INVALID_INPUT", "Trip input is invalid.");
  }

  const input = parsed.data;
  const profile = getCallerMemberProfile(request);
  const destination = await resolvePlaceOrThrow(placeResolver, input.destinationPlaceId);
  const normalizedBaseLocation = await normalizeBaseLocation(input, destination, placeResolver);
  const baseLocation = toBaseLocation(normalizedBaseLocation);

  const normalizedInput = { ...input, baseLocation };
  if (!validateEffectiveTripSetup(normalizedInput)) {
    throw authError("INVALID_INPUT", "Trip setup is invalid.");
  }

  const tripRef = getFirestore().collection("trips").doc();
  const inviteToken = generateInviteToken(1);
  const timestamp = FieldValue.serverTimestamp();
  const trip = {
    name: input.name,
    ownerId: uid,
    phase: "COLLECTING" as const,
    planningCycle: 1,
    membershipVersion: 1,
    destination: toLocationRef(destination),
    startDate: input.startDate,
    endDate: input.endDate,
    timezone: destination.timezone,
    baseLocation,
    defaultDayWindow: input.defaultDayWindow,
    dayOverrides: input.dayOverrides,
    primaryTransport: input.primaryTransport,
    activityBudgetCurrency: input.activityBudgetCurrency,
    activeMemberCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const member = {
    uid,
    ...profile,
    role: "OWNER" as const,
    status: "ACTIVE" as const,
    joinedAt: timestamp,
  };
  const projection = {
    tripId: tripRef.id,
    role: "OWNER" as const,
    status: "ACTIVE" as const,
    tripName: input.name,
    destinationName: destination.name,
    startDate: input.startDate,
    endDate: input.endDate,
    joinedAt: timestamp,
    updatedAt: timestamp,
  };
  const invite = {
    tokenHash: hashInviteToken(inviteToken),
    version: 1,
    createdAt: timestamp,
  };
  const destinationSnapshot = {
    provider: "GOOGLE_PLACES" as const,
    kind: "PLACE_DETAILS" as const,
    cacheKey: destination.placeId,
    source: "GOOGLE_PLACES",
    fetchedAt: timestamp,
    freshness: "FRESH" as const,
    data: toPlaceDetailsSnapshotData(destination),
  };
  const baseSnapshot = baseLocation.source === "GOOGLE_PLACES"
    ? {
        provider: "GOOGLE_PLACES" as const,
        kind: "PLACE_DETAILS" as const,
        cacheKey: baseLocation.placeId,
        source: "GOOGLE_PLACES",
        fetchedAt: timestamp,
        freshness: "FRESH" as const,
        data: {
          placeId: baseLocation.placeId,
          location: { lat: baseLocation.lat, lng: baseLocation.lng },
          placeTypes: [],
          visitWindows: [],
        },
      }
    : undefined;

  tripDocumentSchema.parse(trip);
  tripMemberDocumentSchema.parse(member);
  tripMembershipProjectionSchema.parse(projection);
  inviteDocumentSchema.parse(invite);
  externalSnapshotSchema.parse(destinationSnapshot);
  if (baseSnapshot) externalSnapshotSchema.parse(baseSnapshot);

  const batch = getFirestore().batch();
  batch.set(tripRef, trip);
  batch.set(tripRef.collection("members").doc(uid), member);
  batch.set(tripRef.collection("private").doc("invite"), invite);
  batch.set(getFirestore().collection("users").doc(uid).collection("tripMemberships").doc(tripRef.id), projection);
  batch.set(tripRef.collection("externalSnapshots").doc("destination"), destinationSnapshot);
  if (baseSnapshot) batch.set(tripRef.collection("externalSnapshots").doc("base-location"), baseSnapshot);
  await batch.commit();

  return createTripResultSchema.parse({ tripId: tripRef.id, inviteToken });
}

export const createTrip = onCall(
  { enforceAppCheck: true, secrets: [GOOGLE_MAPS_API_KEY] },
  createTripHandler,
);

async function resolvePlaceOrThrow(
  placeResolver: PlaceResolver,
  placeId: string,
): Promise<NormalizedPlace> {
  try {
    return await placeResolver(placeId);
  } catch (error) {
    if (error instanceof PlaceResolutionError) {
      throw authError(error.reason, error.reason === "NOT_FOUND" ? "Place was not found." : "Place data is unavailable.");
    }
    throw authError("EXTERNAL_DATA_UNAVAILABLE", "Place data is unavailable.");
  }
}

async function normalizeBaseLocation(
  input: CreateTripInput,
  destination: NormalizedPlace,
  placeResolver: PlaceResolver,
): Promise<CreateTripInput["baseLocation"] & { timezone?: string }> {
  if (input.baseLocation.source === "USER_CONFIRMED") {
    return input.baseLocation;
  }

  const placeId = input.baseLocation.placeId;
  if (!placeId) throw authError("NOT_FOUND", "Base location was not found.");
  const base = placeId === destination.placeId
    ? destination
    : await resolvePlaceOrThrow(placeResolver, placeId);

  return {
    placeId: base.placeId,
    name: base.name,
    lat: base.lat,
    lng: base.lng,
    source: "GOOGLE_PLACES" as const,
    timezone: base.timezone,
  };
}

function toBaseLocation(
  location: CreateTripInput["baseLocation"] & { timezone?: string },
): CreateTripInput["baseLocation"] {
  return location.placeId
    ? { placeId: location.placeId, name: location.name, lat: location.lat, lng: location.lng, source: location.source }
    : { name: location.name, lat: location.lat, lng: location.lng, source: location.source };
}

function toLocationRef(place: NormalizedPlace) {
  return { placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng };
}

function toPlaceDetailsSnapshotData(place: NormalizedPlace) {
  return {
    placeId: place.placeId,
    location: { lat: place.lat, lng: place.lng },
    placeTypes: place.placeTypes,
    visitWindows: [],
  };
}
