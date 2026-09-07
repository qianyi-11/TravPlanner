import type { CallableRequest } from "firebase-functions/v2/https";
import { authError } from "./errors";

export interface CallerMemberProfile {
  displayName: string;
  photoURL?: string;
}

export function getCallerMemberProfile(
  request: CallableRequest<unknown>,
): CallerMemberProfile {
  const token = request.auth?.token as Record<string, unknown> | undefined;
  const firebase = token?.firebase as Record<string, unknown> | undefined;

  if (firebase?.sign_in_provider !== "google.com") {
    throw authError("INVALID_INPUT", "A Google-authenticated profile is required.");
  }

  const displayName = typeof token?.name === "string" ? token.name.trim() : "";
  if (!displayName) {
    throw authError("INVALID_INPUT", "A non-empty display name is required.");
  }

  const photoURL = typeof token?.picture === "string" && isHttpUrl(token.picture)
    ? token.picture
    : undefined;

  return photoURL ? { displayName, photoURL } : { displayName };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
