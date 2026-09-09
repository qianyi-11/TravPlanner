import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import type { Place } from "@/lib/types";

async function ensurePlaceExists(placeId: string, importedPlace?: Place) {
  const existing = await prisma.place.findUnique({ where: { id: placeId } });
  if (existing) return existing;
  if (!importedPlace) return null;

  return prisma.place.create({
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
  const { tripId } = await params;
  const body = (await req.json()) as { placeId?: string; place?: Place; memberId: string };
  const { memberId } = body;
  const placeId = body.placeId ?? body.place?.id;

  if (!placeId || !memberId) {
    return NextResponse.json({ error: "Missing place or member" }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const place = await ensurePlaceExists(placeId, body.place);
  if (!place) return NextResponse.json({ error: "Place not found" }, { status: 404 });

  const tripPlace = await prisma.tripPlace.upsert({
    where: { tripId_placeId: { tripId, placeId: place.id } },
    update: {},
    create: { tripId, placeId: place.id },
  });

  await prisma.suggestion.upsert({
    where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId } },
    update: {},
    create: { tripPlaceId: tripPlace.id, memberId },
  });

  return NextResponse.json({ ok: true, placeId: place.id });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { placeId, memberId } = (await req.json()) as { placeId: string; memberId: string };

  const tripPlace = await prisma.tripPlace.findUnique({
    where: { tripId_placeId: { tripId, placeId } },
  });
  if (!tripPlace) return NextResponse.json({ ok: true });

  await prisma.suggestion.deleteMany({ where: { tripPlaceId: tripPlace.id, memberId } });

  const remaining = await prisma.suggestion.count({ where: { tripPlaceId: tripPlace.id } });
  if (remaining === 0) {
    // Cascades away any votes for it too — no one suggested it, so it's gone from the trip entirely.
    await prisma.tripPlace.delete({ where: { id: tripPlace.id } });
  }

  return NextResponse.json({ ok: true });
}
