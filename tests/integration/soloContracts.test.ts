import { describe, expect, it } from "vitest";
import { APP_ERROR_CODES } from "../../shared/contracts/errors";
import {
  applyMinorEditInputSchema,
  applyMinorEditResultSchema,
} from "../../shared/contracts/review";
import { reportFixedBookingResultSchema } from "../../shared/contracts/bookings";
import {
  selectWinningOptionInputSchema,
  selectWinningOptionResultSchema,
} from "../../shared/contracts/voting";
import { setActivityBudgetResultSchema } from "../../shared/contracts/budget";
import { tripDocumentSchema } from "../../shared/schemas/trip";
import { deriveAuthoritativeMembershipState } from "../../functions/src/auth";
import { validateEffectiveTripSetup } from "../../shared/validation/tripSetup";
import { updateTripSetupInputSchema } from "../../shared/contracts/trips";

describe("solo compatibility contracts", () => {
  it.each([
    [[{ uid: "owner", role: "OWNER" }], true],
    [[{ uid: "member", role: "MEMBER" }], false],
    [[{ uid: "owner", role: "OWNER" }, { uid: "member", role: "MEMBER" }], false],
    [[{ uid: "owner-1", role: "OWNER" }, { uid: "owner-2", role: "OWNER" }], false],
    [[], false],
  ] as const)("derives %j as solo=%s", (members, isSolo) => {
    expect(deriveAuthoritativeMembershipState(members).isSolo).toBe(isSolo);
  });

  it("derives membership count and owner from ACTIVE memberships, not a trip counter", () => {
    const stateFromAuthoritativeMembers = deriveAuthoritativeMembershipState([
      { uid: "owner", role: "OWNER" },
      { uid: "member", role: "MEMBER" },
    ]);
    const staleTripActiveMemberCount = 1;
    expect(stateFromAuthoritativeMembers).toMatchObject({ activeMemberCount: 2, isSolo: false, activeOwnerId: "owner" });
    expect(stateFromAuthoritativeMembers.activeMemberCount).not.toBe(staleTripActiveMemberCount);

    expect(stateFromAuthoritativeMembers).not.toMatchObject({ activeMemberCount: 1, isSolo: true });
  });

  it("validates the merged effective trip setup", () => {
    const valid = {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      dayOverrides: [],
      baseLocation: { name: "Base", lat: 1, lng: 2, source: "USER_CONFIRMED" as const },
    };

    expect(validateEffectiveTripSetup(valid)).toBe(true);
    expect(validateEffectiveTripSetup({ ...valid, startDate: "2026-09-09" })).toBe(false);
    expect(validateEffectiveTripSetup({
      ...valid,
      dayOverrides: [{ date: "2026-09-02", startTime: "20:00", endTime: "18:00" }],
    })).toBe(false);
    expect(validateEffectiveTripSetup({
      ...valid,
      dayOverrides: [{ date: "2026-08-31" }],
    })).toBe(false);
    expect(validateEffectiveTripSetup({
      ...valid,
      baseLocation: { ...valid.baseLocation, lat: 91 },
    })).toBe(false);
    expect(updateTripSetupInputSchema.safeParse({
      tripId: "trip-1",
      expectedPlanningCycle: 1,
      patch: { startDate: "2026-09-09" },
    }).success).toBe(true);
  });

  it("exports the stable solo incompatibility reason", () => {
    expect(APP_ERROR_CODES).toContain("NOT_APPLICABLE_FOR_SOLO");
  });

  it("represents direct solo selection and group tie-break input", () => {
    expect(selectWinningOptionInputSchema.parse({
      tripId: "trip-1",
      expectedPlanningCycle: 1,
      selectedOptionId: "option-1",
    }).selectedOptionId).toBe("option-1");
    expect(selectWinningOptionInputSchema.parse({
      tripId: "trip-1",
      expectedPlanningCycle: 1,
      tieBreakOptionId: "option-1",
    }).tieBreakOptionId).toBe("option-1");
  });

  it("allows solo results without approval and accepts confirmed bookings", () => {
    expect(selectWinningOptionResultSchema.parse({
      selectedOptionId: "option-1",
      reviewDraftRevision: 1,
      phase: "REVIEW",
    }).approvalId).toBeUndefined();
    expect(reportFixedBookingResultSchema.parse({
      bookingId: "booking-1",
      status: "CONFIRMED",
      phase: "COLLECTING",
      planningCycle: 1,
    }).status).toBe("CONFIRMED");
  });

  it("keeps budget ceiling optional and uses the neutral name", () => {
    expect(setActivityBudgetResultSchema.parse({ phase: "COLLECTING", planningCycle: 1, cleared: false }))
      .not.toHaveProperty("safeGroupCeiling");
  });

  it("accepts canonical Review minor edits and rejects unsupported or arbitrary patches", () => {
    const base = {
      tripId: "trip-1",
      expectedPlanningCycle: 1,
      expectedReviewDraftRevision: 1,
    };
    for (const edit of [
      { type: "MOVE_ITEM", itemId: "item-1", targetDate: "2026-09-03", targetStartTime: "09:00" },
      { type: "CHANGE_DURATION", itemId: "item-1", durationMinutes: 90 },
    ]) {
      expect(applyMinorEditInputSchema.safeParse({ ...base, edit }).success).toBe(true);
    }
    for (const edit of [
      { type: "REMOVE_INTERESTED", itemId: "item-1" },
      { type: "REPLACE_WITH_EXISTING", itemId: "item-1", replacementCandidateId: "candidate-2" },
      { type: "ADD_EXISTING_INTERESTED", candidateId: "candidate-2" },
      { type: "REMOVE_MUST_DO", itemId: "item-1" },
    ]) {
      expect(applyMinorEditInputSchema.safeParse({ ...base, edit }).success).toBe(false);
    }
    expect(applyMinorEditInputSchema.safeParse({
      ...base,
      edit: { type: "MOVE_ITEM", itemId: "item-1", targetDate: "2026-09-03", targetStartTime: "09:00", patch: {} },
    }).success).toBe(false);
    expect(applyMinorEditResultSchema.parse({
      reviewDraftRevision: 2,
      validationSnapshotId: "validation-1",
    }).approvalId).toBeUndefined();
  });

  it("has no persisted solo mode field", () => {
    const shape = tripDocumentSchema.innerType().shape;
    expect(shape).not.toHaveProperty("soloMode");
    expect(shape).not.toHaveProperty("isSolo");
    expect(shape).not.toHaveProperty("tripMode");
  });
});
