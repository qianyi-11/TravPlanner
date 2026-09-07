import { getFirebaseErrorCode, getFirebaseErrorReason } from "./firebase-error";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Please sign in and try again.",
  "permission-denied": "You do not have permission to do that.",
  "invalid-argument": "Please check the entered values.",
  "failed-precondition": "This action is not available in the current trip state.",
  "not-found": "The requested trip data was not found.",
  "already-exists": "That record already exists.",
  "resource-exhausted": "The request limit was reached. Try again shortly.",
  aborted: "The trip changed while this was processing. Refresh and try again.",
  internal: "The service could not complete that action.",
  unavailable: "The service is temporarily unavailable. Try again shortly.",
  INVALID_INPUT: "Please check the entered values.",
  VALIDATION_FAILED: "The trip data did not pass backend validation.",
  MAJORITY_REQUIRED: "The required member approval has not been reached.",
  APPROVAL_NOT_RESOLVED: "A required approval is still unresolved.",
  EXTERNAL_DATA_UNAVAILABLE: "External place or route data is temporarily unavailable.",
};

export function toUserMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const reason = getFirebaseErrorReason(error);
  const code = getFirebaseErrorCode(error);
  return (reason && MESSAGES[reason]) || (code && MESSAGES[code]) || (error instanceof Error && error.message) || fallback;
}
