import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiErrorResponse } from "@/lib/server/api-error";
import { requireAuthenticatedActor } from "@/lib/server/auth";

/** Patches just the photo (+ provenance) for an existing catalog place — used to
 * backfill real Google photos onto places that were seeded with gradient covers. */
export async function PATCH(req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    await requireAuthenticatedActor();
    const { placeId } = await params;
    const { photo, googlePlaceId } = (await req.json()) as { photo: string; googlePlaceId?: string };

    if (!photo) return NextResponse.json({ error: "photo is required" }, { status: 400 });

    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) return NextResponse.json({ error: "Place not found" }, { status: 404 });

    await prisma.place.update({
      where: { id: placeId },
      data: { photo, googlePlaceId: googlePlaceId ?? place.googlePlaceId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
