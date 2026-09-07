import { describe, expect, it } from "vitest";
import { candidateDocumentSchema, submissionDocumentSchema } from "../../shared/schemas";
import { updateSubmissionInputSchema } from "../../shared/contracts/candidates";
import { candidateIdFromPlaceId, submissionIdForCandidate } from "../../functions/src/candidates/candidateIdentity";

const candidate = {
  placeId: "ChIJplace",
  name: "Place",
  formattedAddress: "1 Main Street",
  location: { lat: 3.139, lng: 101.6869 },
  placeTypes: ["tourist_attraction"],
  environment: "UNKNOWN" as const,
  active: true,
  shortlistStatus: "PENDING" as const,
  firstSubmittedBy: "member",
  firstSubmittedAt: 0,
  createdAt: 0,
  updatedAt: 0,
};

const submission = {
  candidateId: "candidate-id",
  memberId: "member",
  preference: "INTERESTED" as const,
  preferredPeriod: "ANYTIME" as const,
  estimatedDurationMinutes: 60,
  durationSource: "USER_OVERRIDE" as const,
  createdAt: 0,
  updatedAt: 0,
};

describe("candidate and submission domain", () => {
  it("creates deterministic UTF-8 lowercase SHA-256 candidate IDs", () => {
    const id = candidateIdFromPlaceId("ChIJ東京");
    expect(id).toBe("0316ae144a02cb1f54429f8905802cabc2c997390dc550ebd61444b680849505");
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(submissionIdForCandidate("member", id)).toBe(`member_${id}`);
  });

  it("accepts canonical persistence and rejects extra fields", () => {
    expect(candidateDocumentSchema.safeParse(candidate).success).toBe(true);
    expect(candidateDocumentSchema.safeParse({ ...candidate, createdAt: undefined }).success).toBe(false);
    expect(candidateDocumentSchema.safeParse({ ...candidate, environmentSource: "PROVIDER" }).success).toBe(false);
    expect(candidateDocumentSchema.safeParse({ ...candidate, candidateId: "duplicate" }).success).toBe(false);
    expect(submissionDocumentSchema.safeParse(submission).success).toBe(true);
    expect(submissionDocumentSchema.safeParse({ ...submission, active: true }).success).toBe(false);
  });

  it("keeps update patches strict, non-empty, and notes-sensitive", () => {
    const base = { tripId: "trip", expectedPlanningCycle: 1, candidateId: "candidate" };
    expect(updateSubmissionInputSchema.safeParse({ ...base, patch: {} }).success).toBe(false);
    expect(updateSubmissionInputSchema.safeParse({ ...base, patch: { unknown: true } }).success).toBe(false);
    const omitted = updateSubmissionInputSchema.parse({ ...base, patch: { preference: "INTERESTED" } });
    const cleared = updateSubmissionInputSchema.parse({ ...base, patch: { notes: "" } });
    expect(Object.prototype.hasOwnProperty.call(omitted.patch, "notes")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cleared.patch, "notes")).toBe(true);
    expect(cleared.patch.notes).toBe("");
  });
});
