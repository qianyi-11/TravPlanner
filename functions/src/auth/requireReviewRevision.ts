import { authError } from "./errors";

export function requireReviewRevision(
  expectedRevision: number,
  currentRevision: number,
): void {
  if (expectedRevision !== currentRevision) {
    throw authError(
      "STALE_REVIEW_REVISION",
      "The review draft has changed.",
      {
        expectedReviewDraftRevision: expectedRevision,
        currentReviewDraftRevision: currentRevision,
      },
    );
  }
}
