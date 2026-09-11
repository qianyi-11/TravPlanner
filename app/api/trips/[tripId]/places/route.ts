import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import type { Place } from "@/lib/types";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { requireTripMember } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";
import type { Prisma } from "@/lib/generated/prisma";

async function ensurePlaceExists(db: Prisma.TransactionClient, placeId: string, importedPlace?: Place) {
  const existing = await db.place.findUnique({ where: { id: placeId } });
  if (existing) return existing;
  if (!importedPlace) return null;

  return db.place.create({
    data: {
      id: importedPlace.id,
      name: importedPlace.name,
      category: importedPlace.category,
      area: importedPlace.area,
      destination: importedPlace.destination,
      lat: importedPlace.coordinates.lat,
      lng: importedPlace.coordinates.lng,
      address: importedPlace.address,
      photo: importedPlace.photo,
      rating: importedPlace.rating,
      reviewCount: importedPlace.reviewCount,
      priceLevel: importedPlace.priceLevel,
      priceLabel: importedPlace.priceLabel,
      description: importedPlace.description,
      openingHoursJson: JSON.stringify(importedPlace.openingHours),
      isOpenNow: importedPlace.isOpenNow,
      closesAt: importedPlace.closesAt ?? null,
      estimatedDurationMinutes: importedPlace.estimatedDurationMinutes,
      reviewsJson: JSON.stringify(importedPlace.reviews),
      availability: importedPlace.availability,
      source: "google",
      googlePlaceId: importedPlace.id.replace(/^g-/, ""),
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const body = await parseJsonObject(req);
    const memberId = requireId(body.memberId, "memberId");
    const placeId = requireId(body.placeId ?? (typeof body.place === "object" && body.place !== null ? (body.place as { id?: unknown }).id : undefined), "placeId");
    let importedPlace: Place | undefined;
    if (body.place !== undefined) {
      if (typeof body.place !== "object" || body.place === null || Array.isArray(body.place)) {
        throw new ApiError(400, "INVALID_REQUEST", "place must be an object");
      }
      const importedId = requireId((body.place as { id?: unknown }).id, "place.id");
      if (importedId !== placeId) throw new ApiError(400, "INVALID_REQUEST", "place.id must match placeId");
      importedPlace = body.place as Place;
    }
    await requireTripMember(tripId, memberId);

    const place = await prisma.$transaction(async (tx) => {
      const savedPlace = await ensurePlaceExists(tx, placeId, importedPlace);
      if (!savedPlace) throw new ApiError(404, "PLACE_NOT_FOUND", "Place not found");
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
    const memberId = requireId(body.memberId, "memberId");
    await requireTripMember(tripId, memberId);

    await prisma.$transaction(async (tx) => {
      const tripPlace = await tx.tripPlace.findUnique({ where: { tripId_placeId: { tripId, placeId } } });
      if (!tripPlace) return;
      await tx.suggestion.deleteMany({ where: { tripPlaceId: tripPlace.id, memberId } });
      const remaining = await tx.suggestion.count({ where: { tripPlaceId: tripPlace.id } });
      // Cascades away votes too when nobody suggests the place anymore.
      if (remaining === 0) await tx.tripPlace.delete({ where: { id: tripPlace.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
