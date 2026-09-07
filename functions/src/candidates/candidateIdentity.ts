import { createHash } from "node:crypto";

export function candidateIdFromPlaceId(canonicalPlaceId: string): string {
  return createHash("sha256").update(canonicalPlaceId, "utf8").digest("hex");
}

export function submissionIdForCandidate(memberId: string, candidateId: string): string {
  return `${memberId}_${candidateId}`;
}
