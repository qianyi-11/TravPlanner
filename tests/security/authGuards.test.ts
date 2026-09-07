import { describe, expect, it } from "vitest";
import type { TripAuthContext } from "../../functions/src/auth";
import {
  requireActiveMember,
  requireCurrentVersion,
  requireOwner,
  requirePhase,
  requirePlanningCycle,
  requireReviewRevision,
  requireMembershipVersion,
} from "../../functions/src/auth";

function context(
  overrides: Partial<TripAuthContext> = {},
): TripAuthContext {
  return {
    uid: "member",
    tripId: "trip-1",
    trip: {
      ownerId: "owner",
      phase: "VOTING",
      planningCycle: 2,
      membershipVersion: 2,
      currentItineraryVersionId: "v2",
    } as TripAuthContext["trip"],
    member: {
      uid: "member",
      role: "MEMBER",
      status: "ACTIVE",
    } as NonNullable<TripAuthContext["member"]>,
    ...overrides,
  };
}

function reasonOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    const details = (error as { details?: { reason?: string } }).details;
    return details?.reason;
  }
}

describe("authorization guards", () => {
  it("requires membership", () => {
    expect(
      reasonOf(() => requireActiveMember(context({ member: null }))),
    ).toBe("NOT_MEMBER");
  });

  it("rejects removed membership", () => {
    const ctx = context();
    ctx.member = {
      ...ctx.member!,
      status: "REMOVED",
    };

    expect(reasonOf(() => requireActiveMember(ctx))).toBe(
      "MEMBER_INACTIVE",
    );
  });

  it("requires consistent OWNER role and trip owner pointer", () => {
    expect(reasonOf(() => requireOwner(context()))).toBe("OWNER_REQUIRED");

    const ctx = context({
      uid: "owner",
      trip: {
        ...context().trip,
        ownerId: "owner",
      },
      member: {
        ...context().member!,
        uid: "owner",
        role: "OWNER",
      },
    });

    expect(() => requireOwner(ctx)).not.toThrow();
  });

  it("enforces phase", () => {
    expect(
      reasonOf(() => requirePhase(context(), ["REVIEW"])),
    ).toBe("INVALID_PHASE");
  });

  it("enforces planning cycle", () => {
    expect(
      reasonOf(() => requirePlanningCycle(context(), 1)),
    ).toBe("STALE_PLANNING_CYCLE");
  });

  it("enforces review revision", () => {
    expect(
      reasonOf(() => requireReviewRevision(2, 3)),
    ).toBe("STALE_REVIEW_REVISION");
  });

  it("enforces current itinerary version", () => {
    expect(
      reasonOf(() => requireCurrentVersion(context(), "v1")),
    ).toBe("STALE_ITINERARY_VERSION");
  });

  it("enforces membership version freshness", () => {
    expect(() => requireMembershipVersion(context(), 2)).not.toThrow();
    expect(reasonOf(() => requireMembershipVersion(context(), 1))).toBe("STALE_MEMBERSHIP_VERSION");
  });
});
