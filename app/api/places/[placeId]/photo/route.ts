import { ApiError, apiErrorResponse } from "@/lib/server/api-error";
import { requireAccessiblePlaceActor } from "@/lib/server/authorization";
import { fetchGooglePlacePhoto } from "@/lib/server/google/places";
import { requireId } from "@/lib/server/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const placeId = requireId((await params).placeId, "placeId");
    const place = await requireAccessiblePlaceActor(placeId);
    if (place.source !== "google" || !place.photoRef) throw new ApiError(404, "PLACE_PHOTO_NOT_FOUND", "Place photo not found");
    const photo = await fetchGooglePlacePhoto(place.photoRef);
    return new Response(photo.body, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
