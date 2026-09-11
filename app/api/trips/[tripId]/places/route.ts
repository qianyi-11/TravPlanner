import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { fetchGooglePlace } from "@/lib/server/google/places";
import { parseJsonObject, requireId } from "@/lib/server/validation";
import { prisma } from "@/lib/server/prisma";
import type { Place } from "@/lib/types";

function placeData(place: Place & { photoRef?: string }) {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    area: place.area,
    destination: place.destination,
    lat: place.coordinates.lat,
    lng: place.coordinates.lng,
    address: place.address,
    photo: place.photo,
    rating: place.rating,
    reviewCount: place.reviewCount,
    priceLevel: place.priceLevel,
    priceLabel: place.priceLabel,
    description: place.description,
    openingHoursJson: JSON.stringify(place.openingHours),
    isOpenNow: place.isOpenNow,
    closesAt: place.closesAt ?? null,
    estimatedDurationMinutes: place.estimatedDurationMinutes,
    reviewsJson: JSON.stringify(place.reviews),
    availability: place.availability,
    source: "google",
    googlePlaceId: place.googlePlaceId ?? null,
    photoRef: place.photoRef ?? null,
    providerFetchedAt: place.providerFetchedAt ? new Date(place.providerFetchedAt) : new Date(),
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(req);
    if (body.place !== undefined) throw new ApiError(400, "INVALID_REQUEST", "Place facts must be resolved by the server");

    const requestedId = body.placeId !== undefined ? requireId(body.placeId, "placeId") : undefined;
    const requestedGoogleId = body.googlePlaceId !== undefined ? requireId(body.googlePlaceId, "googlePlaceId") : undefined;
    if (!requestedId && !requestedGoogleId) throw new ApiError(400, "INVALID_ID", "placeId or googlePlaceId is required");
    const { memberId, trip } = await requireTripActor(tripId);
    const googlePlaceId = requestedGoogleId ?? (requestedId?.startsWith("g-") ? requestedId.slice(2) : undefined);
    const canonicalId = googlePlaceId ? `g-${googlePlaceId}` : requestedId!;

    const existing = await prisma.place.findFirst({
      where: googlePlaceId ? { OR: [{ id: canonicalId }, { googlePlaceId }] } : { id: canonicalId },
    });
    const normalizedGoogle = googlePlaceId && !existing
      ? await fetchGooglePlace(googlePlaceId, (JSON.parse(trip.destinationsJson) as string[])[0] ?? "")
      : null;
    if (!existing && !normalizedGoogle) throw new ApiError(404, "PLACE_NOT_FOUND", "Place not found");

    const place = await prisma.$transaction(async (tx) => {
      const savedPlace = existing ?? await tx.place.create({ data: placeData(normalizedGoogle!) });
      const tripPlace = await tx.tripPlace.upsert({
        where: { tripId_placeId: { tripId, placeId: savedPlace.id } },
        update: {},
        create: { tripId, placeId: savedPlace.id },
      });
      await tx.suggestion.upsert({
        where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId } },
        update: {},
        create: { tripPlaceId: tripPlace.id, memberId },
      });
      return savedPlace;
    });

    return NextResponse.json({ ok: true, placeId: place.id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(req);
    const placeId = requireId(body.placeId, "placeId");
    const { memberId } = await requireTripActor(tripId);

    await prisma.$transaction(async (tx) => {
      const tripPlace = await tx.tripPlace.findUnique({ where: { tripId_placeId: { tripId, placeId } } });
      if (!tripPlace) return;
      await tx.suggestion.deleteMany({ where: { tripPlaceId: tripPlace.id, memberId } });
      const remaining = await tx.suggestion.count({ where: { tripPlaceId: tripPlace.id } });
      if (remaining === 0) await tx.tripPlace.delete({ where: { id: tripPlace.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
