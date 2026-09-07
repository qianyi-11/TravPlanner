import { describe, expect, it } from "vitest";
import {
  confirmCriticalFactInputSchema,
  confirmCriticalFactResultSchema,
  proposeCriticalFactInputSchema,
  proposeCriticalFactResultSchema,
} from "../../shared/contracts/validation";
import {
  criticalFactProposalDocumentSchema,
  criticalFactSchema,
  persistedCriticalFactSchema,
} from "../../shared/schemas/criticalFactProposal";
import {
  externalSnapshotSchema,
  normalizedRouteDataSchema,
} from "../../shared/schemas/externalSnapshot";
import {
  validationHardCheckSchema,
  validationSnapshotDocumentSchema,
} from "../../shared/schemas/validation";

const validSnapshot = {
  planningCycle: 1,
  scope: "CANDIDATE" as const,
  targetId: "candidate-1",
  result: "VALID" as const,
  schedulable: true,
  reasonCodes: [],
  hardChecks: [
    { check: "PLACE_IDENTITY" as const, status: "PASS" as const },
    { check: "LOCATION" as const, status: "PASS" as const },
  ],
  externalSnapshotIds: [],
  checkedAt: 0,
};

describe("validation shared contracts", () => {
  it("enforces validation result and schedulable semantics", () => {
    expect(validationSnapshotDocumentSchema.safeParse(validSnapshot).success).toBe(true);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      result: "INVALID",
      schedulable: false,
      reasonCodes: ["OUTSIDE_TRIP_DATE"],
      hardChecks: [
        { check: "TRIP_DATE", status: "FAIL", reasonCode: "OUTSIDE_TRIP_DATE" },
      ],
    }).success).toBe(true);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      result: "INVALID",
      schedulable: true,
      reasonCodes: ["OUTSIDE_TRIP_DATE"],
      hardChecks: [
        { check: "TRIP_DATE", status: "FAIL", reasonCode: "OUTSIDE_TRIP_DATE" },
      ],
    }).success).toBe(false);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      result: "INVALID",
      schedulable: false,
    }).success).toBe(false);
  });

  it("supports critical and non-critical NEEDS_CONFIRMATION states", () => {
    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      result: "NEEDS_CONFIRMATION",
      schedulable: false,
      reasonCodes: ["MISSING_DURATION"],
      hardChecks: [
        { check: "DURATION", status: "NEEDS_CONFIRMATION", reasonCode: "MISSING_DURATION" },
      ],
    }).success).toBe(true);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      result: "NEEDS_CONFIRMATION",
      schedulable: true,
      reasonCodes: ["PRICE_UNKNOWN"],
      hardChecks: [
        { check: "PRICE", status: "NEEDS_CONFIRMATION", reasonCode: "PRICE_UNKNOWN" },
      ],
    }).success).toBe(true);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      result: "NEEDS_CONFIRMATION",
      schedulable: false,
      reasonCodes: ["OUTSIDE_DAY_WINDOW"],
      hardChecks: [
        { check: "DAY_WINDOW", status: "FAIL", reasonCode: "OUTSIDE_DAY_WINDOW" },
      ],
    }).success).toBe(false);
  });

  it("requires normalized hard-check reasons and unique snapshot references", () => {
    expect(validationHardCheckSchema.safeParse({ check: "DURATION", status: "FAIL" }).success).toBe(false);
    expect(validationHardCheckSchema.safeParse({
      check: "DURATION",
      status: "PASS",
      reasonCode: "MISSING_DURATION",
    }).success).toBe(false);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      hardChecks: [
        { check: "LOCATION", status: "PASS" },
        { check: "LOCATION", status: "PASS" },
      ],
    }).success).toBe(false);

    expect(validationSnapshotDocumentSchema.safeParse({
      ...validSnapshot,
      externalSnapshotIds: ["external-1", "external-1"],
    }).success).toBe(false);
  });

  it("keeps public critical facts separate from persisted PRICE currency", () => {
    expect(criticalFactSchema.safeParse({
      type: "PRICE",
      amount: 25.5,
      costStatus: "ESTIMATED",
    }).success).toBe(true);
    expect(criticalFactSchema.safeParse({
      type: "PRICE",
      amount: 25.5,
      costStatus: "ESTIMATED",
      currency: "MYR",
    }).success).toBe(false);

    expect(persistedCriticalFactSchema.safeParse({
      type: "PRICE",
      amount: 25.5,
      costStatus: "ESTIMATED",
      currency: "MYR",
    }).success).toBe(true);
    expect(persistedCriticalFactSchema.safeParse({
      type: "PRICE",
      amount: 25.5,
      costStatus: "ESTIMATED",
    }).success).toBe(false);

    for (const fact of [
      { type: "VISIT_WINDOW", date: "2026-09-06", startTime: "09:00", endTime: "09:00" },
      { type: "VISIT_WINDOW", date: "2026-09-06", startTime: "18:00", endTime: "09:00" },
    ]) {
      expect(criticalFactSchema.safeParse(fact).success).toBe(false);
    }
  });

  it("enforces structural Critical Fact proposal statuses", () => {
    const baseProposal = {
      candidateId: "candidate-1",
      fact: { type: "DURATION" as const, durationMinutes: 90 },
      proposedBy: "member-1",
      createdAt: 0,
      updatedAt: 0,
    };

    expect(criticalFactProposalDocumentSchema.safeParse({
      ...baseProposal,
      status: "PENDING",
    }).success).toBe(true);
    expect(criticalFactProposalDocumentSchema.safeParse({
      ...baseProposal,
      status: "PENDING",
      confirmedBy: "owner",
      confirmedAt: 0,
    }).success).toBe(false);
    expect(criticalFactProposalDocumentSchema.safeParse({
      ...baseProposal,
      status: "CONFIRMED",
    }).success).toBe(false);
    expect(criticalFactProposalDocumentSchema.safeParse({
      ...baseProposal,
      status: "CONFIRMED",
      confirmedBy: "owner",
      confirmedAt: 0,
    }).success).toBe(true);
    expect(criticalFactProposalDocumentSchema.safeParse({
      ...baseProposal,
      status: "REJECTED",
      rejectedBy: "owner",
      rejectedAt: 0,
    }).success).toBe(true);
  });

  it("uses strict normalized external snapshot unions", () => {
    const placeData = {
      placeId: "place-1",
      location: { lat: 3.139, lng: 101.6869 },
      placeTypes: ["tourist_attraction"],
      visitWindows: [
        { date: "2026-09-06", startMinute: 540, endMinute: 1020 },
      ],
    };

    expect(externalSnapshotSchema.safeParse({
      provider: "GOOGLE_PLACES",
      kind: "PLACE_DETAILS",
      cacheKey: "place:place-1",
      source: "places-v1",
      fetchedAt: 0,
      freshness: "FRESH",
      data: placeData,
    }).success).toBe(true);

    expect(externalSnapshotSchema.safeParse({
      provider: "GOOGLE_PLACES",
      kind: "PLACE_DETAILS",
      cacheKey: "place:place-1",
      source: "places-v1",
      fetchedAt: 0,
      freshness: "UNAVAILABLE",
    }).success).toBe(true);

    expect(externalSnapshotSchema.safeParse({
      provider: "GOOGLE_PLACES",
      kind: "PLACE_DETAILS",
      cacheKey: "place:place-1",
      source: "places-v1",
      fetchedAt: 0,
      freshness: "UNAVAILABLE",
      data: placeData,
    }).success).toBe(false);

    const userConfirmedSnapshot = {
      provider: "USER_CONFIRMED" as const,
      kind: "CRITICAL_FACT" as const,
      cacheKey: "critical:candidate-1:duration",
      source: "USER_CONFIRMED",
      fetchedAt: 0,
      freshness: "FRESH" as const,
      submittedBy: "member-1",
      confirmedBy: "owner",
      confirmedAt: 0,
      data: { type: "DURATION" as const, durationMinutes: 90 },
    };

    expect(externalSnapshotSchema.safeParse(userConfirmedSnapshot).success).toBe(true);
    expect(externalSnapshotSchema.safeParse({
      ...userConfirmedSnapshot,
      source: "manual-entry",
    }).success).toBe(false);
  });

  it("normalizes route departure buckets to 15-minute boundaries", () => {
    const route = {
      origin: { lat: 3.1, lng: 101.6 },
      destination: { lat: 3.2, lng: 101.7 },
      transportMode: "TRANSIT" as const,
      departureBucket: { date: "2026-09-06", startMinute: 555 },
      durationMinutes: 24,
    };
    expect(normalizedRouteDataSchema.safeParse(route).success).toBe(true);
    expect(normalizedRouteDataSchema.safeParse({
      ...route,
      departureBucket: { date: "2026-09-06", startMinute: 557 },
    }).success).toBe(false);
  });

  it("requires exactly one optimistic-authority input shape", () => {
    const proposeBase = {
      tripId: "trip-1",
      candidateId: "candidate-1",
      fact: { type: "DURATION" as const, durationMinutes: 90 },
    };

    expect(proposeCriticalFactInputSchema.safeParse({
      ...proposeBase,
      expectedPlanningCycle: 2,
    }).success).toBe(true);
    expect(proposeCriticalFactInputSchema.safeParse({
      ...proposeBase,
      expectedItineraryVersionId: "version-2",
    }).success).toBe(true);
    expect(proposeCriticalFactInputSchema.safeParse(proposeBase).success).toBe(false);
    expect(proposeCriticalFactInputSchema.safeParse({
      ...proposeBase,
      expectedPlanningCycle: 2,
      expectedItineraryVersionId: "version-2",
    }).success).toBe(false);

    const confirmBase = {
      tripId: "trip-1",
      proposalId: "proposal-1",
      decision: "CONFIRM" as const,
    };
    expect(confirmCriticalFactInputSchema.safeParse({
      ...confirmBase,
      expectedPlanningCycle: 2,
    }).success).toBe(true);
    expect(confirmCriticalFactInputSchema.safeParse({
      ...confirmBase,
      expectedItineraryVersionId: "version-2",
    }).success).toBe(true);
    expect(confirmCriticalFactInputSchema.safeParse(confirmBase).success).toBe(false);

    expect(proposeCriticalFactResultSchema.safeParse({
      proposalId: "proposal-1",
      status: "PENDING",
    }).success).toBe(true);
    expect(confirmCriticalFactResultSchema.safeParse({
      proposalId: "proposal-1",
      status: "CONFIRMED",
      changed: true,
      validationSnapshotId: "validation-1",
    }).success).toBe(true);
  });
});
