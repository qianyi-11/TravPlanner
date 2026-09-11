import { ApiError, apiErrorResponse } from "@/lib/server/api-error";

export async function PATCH() {
  try {
    throw new ApiError(410, "PLACE_PHOTO_SERVER_ONLY", "Place photos are resolved by the server during import");
  } catch (error) {
    return apiErrorResponse(error);
  }
}
