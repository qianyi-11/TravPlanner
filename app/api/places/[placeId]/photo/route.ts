import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";

/**
 * Patches the photos (+ provenance) for an existing place — used to backfill real
 * Google photos onto catalog places that were seeded with gradient covers.
 * `photo` is the cover; `photos` is the gallery set shown on the place details page.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const { photo, photos, googlePlaceId } = (await req.json()) as {
    photo?: string;
    photos?: string[];
    googlePlaceId?: string;
  };

  const gallery = Array.isArray(photos) ? photos.filter((p) => typeof p === "string" && p) : [];
  const cover = photo ?? gallery[0];

  if (!cover) {
    return NextResponse.json({ error: "photo or photos is required" }, { status: 400 });
  }

  const place = await prisma.place.findUnique({ where: { id: placeId } });
  if (!place) return NextResponse.json({ error: "Place not found" }, { status: 404 });

  await prisma.place.update({
    where: { id: placeId },
    data: {
      photo: cover,
      photosJson: gallery.length > 0 ? JSON.stringify(gallery) : place.photosJson,
      googlePlaceId: googlePlaceId ?? place.googlePlaceId,
    },
  });

  return NextResponse.json({ ok: true, count: gallery.length });
}
