import type { CallableRequest } from "firebase-functions/v2/https";
import { authError } from "./errors";

export function requireAuth<T>(request: CallableRequest<T>): string {
  const uid = request.auth?.uid;

  if (!uid) {
    throw authError("UNAUTHENTICATED", "Authentication is required.");
  }

  return uid;
}
