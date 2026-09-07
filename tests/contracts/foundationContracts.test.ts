import { describe, expect, it } from "vitest";
import { APP_ERROR_CODES } from "../../shared/contracts/errors";
import {
  joinTripResultSchema,
  leaveTripResultSchema,
  removeMemberResultSchema,
  resetInviteResultSchema,
  transferOwnershipResultSchema,
} from "../../shared/contracts/membership";
import { createTripInputSchema, deleteTripResultSchema } from "../../shared/contracts/trips";
import { MEMBERSHIP_IMPACT_REASON_CODES } from "../../shared/enums";
import { selfLeaveReceiptSchema } from "../../shared/schemas/membership";
import { tripMemberDocumentSchema } from "../../shared/schemas/membership";
import { tripDocumentSchema } from "../../shared/schemas/trip";
import { candidateDocumentSchema } from "../../shared/schemas/candidate";
import { changeRequestChangeSchema } from "../../shared/contracts/changeRequests";

const baseTrip = {
  name: "Trip",
  ownerId: "owner",
  phase: "COLLECTING" as const,
  planningCycle: 1,
  membershipVersion: 1,
  destination: { placeId: "place", name: "City", lat: 1, lng: 2 },
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  timezone: "Asia/Kuala_Lumpur",
  baseLocation: { name: "Base", lat: 1, lng: 2, source: "USER_CONFIRMED" as const },
  defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
  dayOverrides: [],
  primaryTransport: "WALKING" as const,
  activityBudgetCurrency: "MYR",
  activeMemberCount: 1,
  createdAt: 0,
  updatedAt: 0,
};

const membershipResult = {
  activeMemberCount: 1,
  membershipVersion: 1,
  phase: "COLLECTING" as const,
  planningCycle: 1,
};

describe("foundation contract alignment", () => {
  it("requires a positive membershipVersion and no persisted solo flag", () => {
    expect(tripDocumentSchema.parse(baseTrip).membershipVersion).toBe(1);
    for (const value of [0, -1]) {
      expect(tripDocumentSchema.safeParse({ ...baseTrip, membershipVersion: value }).success).toBe(false);
    }
    expect(tripDocumentSchema.safeParse({ ...baseTrip, membershipVersion: undefined }).success).toBe(false);
    expect(tripDocumentSchema.innerType().shape).not.toHaveProperty("isSolo");
    expect(tripDocumentSchema.innerType().shape).not.toHaveProperty("soloMode");
    expect(tripDocumentSchema.innerType().shape).not.toHaveProperty("tripMode");
  });

  it("accepts only the stable membership-impact codes", () => {
    expect(removeMemberResultSchema.safeParse({ memberId: "member", changed: false, ...membershipResult, workflowReopened: false, impactReasonCodes: [...MEMBERSHIP_IMPACT_REASON_CODES] }).success).toBe(true);
    expect(removeMemberResultSchema.safeParse({ memberId: "member", changed: false, ...membershipResult, workflowReopened: false, impactReasonCodes: ["UNKNOWN"] }).success).toBe(false);
    expect(selfLeaveReceiptSchema.safeParse({ activeMemberCount: 1, membershipVersion: 2, phase: "COLLECTING", planningCycle: 1 }).success).toBe(true);
  });

  it("uses removalKind and removes delayed eligibility", () => {
    const member = { uid: "member", displayName: "Member", role: "MEMBER" as const, status: "ACTIVE" as const, joinedAt: 0 };
    expect(tripMemberDocumentSchema.parse({ ...member, removalKind: "SELF_LEAVE" }).removalKind).toBe("SELF_LEAVE");
    expect(tripMemberDocumentSchema.parse({ ...member, removalKind: "OWNER_REMOVAL" }).removalKind).toBe("OWNER_REMOVAL");
    expect(tripMemberDocumentSchema.shape).not.toHaveProperty("decisionEligibleFromCycle");
  });

  it("exposes the current error vocabulary", () => {
    for (const code of ["STALE_MEMBERSHIP_VERSION", "INVITE_RESET", "NO_SCHEDULABLE_CANDIDATES", "NO_FEASIBLE_OPTIONS"]) {
      expect(APP_ERROR_CODES).toContain(code);
    }
    for (const code of ["NO_ACTIVE_CANDIDATES", "CANDIDATE_INACTIVE", "NO_OPTION_VOTES"]) {
      expect(APP_ERROR_CODES).toContain(code);
    }
    expect(APP_ERROR_CODES).not.toContain("DECISION_NOT_ELIGIBLE");
    expect(APP_ERROR_CODES).not.toContain("INVITE_EXPIRED_OR_RESET");
  });

  it("supports legacy voting metadata and candidate activation defaults", () => {
    expect(tripDocumentSchema.parse(baseTrip)).not.toHaveProperty("votingBasisMembershipVersion");
    expect(tripDocumentSchema.parse({ ...baseTrip, votingBasisMembershipVersion: 2 }).votingBasisMembershipVersion).toBe(2);
    const candidate = {
      placeId: "place",
      name: "Place",
      location: { lat: 1, lng: 2 },
      placeTypes: [],
      environment: "UNKNOWN" as const,
      active: true,
      shortlistStatus: "PENDING" as const,
      firstSubmittedBy: "owner",
      firstSubmittedAt: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(candidateDocumentSchema.parse(candidate).activationVersion).toBe(1);
    expect(candidateDocumentSchema.safeParse({ ...candidate, activationVersion: 0 }).success).toBe(false);
  });

  it("accepts the six canonical result shapes", () => {
    expect(joinTripResultSchema.parse({ tripId: "trip-1", role: "OWNER", status: "ACTIVE", alreadyMember: true, ...membershipResult })).toBeTruthy();
    expect(joinTripResultSchema.parse({ tripId: "trip-1", role: "MEMBER", status: "ACTIVE", alreadyMember: false, ...membershipResult })).toBeTruthy();
    expect(resetInviteResultSchema.parse({ inviteToken: "1234567890123456", inviteVersion: 2 })).toBeTruthy();
    expect(removeMemberResultSchema.parse({ memberId: "member", changed: false, ...membershipResult, workflowReopened: false, impactReasonCodes: [] })).toBeTruthy();
    expect(leaveTripResultSchema.parse({ changed: false, ...membershipResult, workflowReopened: false, impactReasonCodes: [] })).toBeTruthy();
    expect(transferOwnershipResultSchema.parse({ previousOwnerId: "owner", ownerId: "owner", changed: false, membershipVersion: 1 })).toBeTruthy();
    expect(deleteTripResultSchema.parse({ tripId: "trip-1", deleted: true })).toBeTruthy();
  });

  it("rejects invalid time, window, coordinates, and trip dates", () => {
    const valid = { name: "Trip", destinationPlaceId: "place", startDate: "2026-09-01", endDate: "2026-09-07", baseLocation: { name: "Base", lat: 1, lng: 2, source: "USER_CONFIRMED" as const }, defaultDayWindow: { startTime: "09:00", endTime: "18:00" }, primaryTransport: "WALKING" as const, activityBudgetCurrency: "MYR" };
    for (const time of ["99:00", "12:72", "24:00", "25:15", "12:99", "99:88"]) {
      expect(createTripInputSchema.safeParse({ ...valid, defaultDayWindow: { startTime: time, endTime: "18:00" } }).success).toBe(false);
    }
    for (const window of [["09:00", "09:00"], ["22:00", "02:00"]]) {
      expect(createTripInputSchema.safeParse({ ...valid, defaultDayWindow: { startTime: window[0], endTime: window[1] } }).success).toBe(false);
    }
    for (const location of [{ lat: 91, lng: 0 }, { lat: -91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 0, lng: -181 }]) {
      expect(createTripInputSchema.safeParse({ ...valid, baseLocation: { ...valid.baseLocation, ...location } }).success).toBe(false);
    }
    expect(createTripInputSchema.safeParse({ ...valid, endDate: "2026-09-08" }).success).toBe(false);
    expect(createTripInputSchema.safeParse({ ...valid, dayOverrides: [{ date: "2026-08-31" }] }).success).toBe(false);
    expect(createTripInputSchema.safeParse(valid).success).toBe(true);
  });

  it("uses SET/CLEAR semantics for budget change requests", () => {
    expect(changeRequestChangeSchema.safeParse({ operation: "CHANGE_BUDGET", amount: 100 }).success).toBe(true);
    expect(changeRequestChangeSchema.safeParse({ operation: "CHANGE_BUDGET", clear: true }).success).toBe(true);
    expect(changeRequestChangeSchema.safeParse({ operation: "CHANGE_BUDGET", amount: 0 }).success).toBe(false);
    expect(changeRequestChangeSchema.safeParse({ operation: "CHANGE_BUDGET", amount: 100, clear: true }).success).toBe(false);
  });
});
