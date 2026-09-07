import { describe, expect, it } from "vitest";
import { toUserMessage } from "../../lib/errors/user-message";
import { getAvailableTripActions, getPrimaryTripRoute } from "../../lib/navigation/trip-phase";
import { TRANSPORT_LABELS } from "../../lib/trips/mapping";
import { validateTripSetupDates } from "../../lib/trips/validation";

describe("frontend workflow mappings", () => {
  it("rejects invalid windows and trips longer than seven days", () => {
    expect(validateTripSetupDates("2026-09-01", "2026-09-08", "08:00", "22:00")).toContain("7 calendar days");
    expect(validateTripSetupDates("2026-09-01", "2026-09-03", "22:00", "08:00")).toContain("before");
    expect(validateTripSetupDates("2026-09-01", "2026-09-03", "08:00", "22:00")).toBeNull();
  });

  it("keeps transport and phase routing backend-aligned", () => {
    expect(TRANSPORT_LABELS.TRANSIT).toBe("Public transport");
    expect(getPrimaryTripRoute({ id: "trip-1", phase: "FINALIZED" })).toBe("/trips/trip-1/plan");
    expect(getAvailableTripActions({ phase: "VOTING" }, { role: "OWNER" }).canCloseVoting).toBe(true);
    expect(getAvailableTripActions({ phase: "VOTING" }, { role: "MEMBER" }).canCloseVoting).toBe(false);
  });

  it("maps callable error codes without exposing transport details", () => {
    expect(toUserMessage({ code: "functions/permission-denied", message: "private detail" })).toBe("You do not have permission to do that.");
    expect(toUserMessage({ code: "functions/failed-precondition", details: { reason: "VALIDATION_FAILED" } })).toBe("The trip data did not pass backend validation.");
  });
});
