import { HttpsError } from "firebase-functions/v2/https";
import type { AppErrorCode } from "@travel-planner/shared";

type HttpsCode = ConstructorParameters<typeof HttpsError>[0];

const HTTPS_CODE_BY_REASON: Partial<Record<AppErrorCode, HttpsCode>> = {
  UNAUTHENTICATED: "unauthenticated",
  NOT_MEMBER: "permission-denied",
  MEMBER_INACTIVE: "permission-denied",
  OWNER_REQUIRED: "permission-denied",
  INVALID_PHASE: "failed-precondition",
  INVALID_INPUT: "invalid-argument",
  NOT_FOUND: "not-found",
  LIMIT_EXCEEDED: "resource-exhausted",
  CONFLICT: "aborted",
  STALE_PLANNING_CYCLE: "aborted",
  STALE_MEMBERSHIP_VERSION: "aborted",
  STALE_REVIEW_REVISION: "aborted",
  STALE_ITINERARY_VERSION: "aborted",
  NOT_APPLICABLE_FOR_SOLO: "failed-precondition",
  EXTERNAL_DATA_UNAVAILABLE: "unavailable",
  INVITE_INVALID: "permission-denied",
  INVITE_RESET: "failed-precondition",
  MEMBERSHIP_FROZEN: "failed-precondition",
  NO_ACTIVE_CANDIDATES: "failed-precondition",
  CANDIDATE_INACTIVE: "failed-precondition",
  NO_OPTION_VOTES: "failed-precondition",
};

export function authError(
  reason: AppErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): HttpsError {
  return new HttpsError(
    HTTPS_CODE_BY_REASON[reason] ?? "failed-precondition",
    message,
    { reason, ...extra },
  );
}
