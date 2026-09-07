import { describe, expect, it } from "vitest";
import {
  CHANGE_REQUEST_OPERATIONS,
  changeRequestChangeSchema,
  createChangeRequestInputSchema,
  reviewChangeRequestInputSchema,
  applyChangeRequestInputSchema,
} from "@travel-planner/shared";

const canonicalChanges = [
  { operation: "MOVE_ACTIVITY", itemId: "item-1", targetDate: "2026-10-01", targetStartTime: "10:00" },
  { operation: "CHANGE_TIME", itemId: "item-1", targetStartTime: "11:00" },
  { operation: "CHANGE_DURATION", itemId: "item-1", durationMinutes: 90 },
  { operation: "ADD_ACTIVITY", candidateId: "candidate-2", targetDate: "2026-10-01" },
  { operation: "REMOVE_ACTIVITY", itemId: "item-1" },
  { operation: "REPLACE_ACTIVITY", itemId: "item-1", replacementCandidateId: "candidate-2" },
  {
    operation: "CHANGE_FIXED_BOOKING",
    action: "UPDATE",
    bookingId: "booking-1",
    date: "2026-10-01",
    startTime: "12:00",
    durationMinutes: 60,
  },
  { operation: "CHANGE_FIXED_BOOKING", action: "CANCEL", bookingId: "booking-1", cancel: true },
  { operation: "CHANGE_DESTINATION", destinationPlaceId: "place-2" },
  { operation: "CHANGE_TRIP_DATES", startDate: "2026-10-01", endDate: "2026-10-03" },
  {
    operation: "CHANGE_BASE_LOCATION",
    baseLocation: { source: "USER_CONFIRMED", name: "Hotel", lat: 3.1, lng: 101.6 },
  },
  {
    operation: "CHANGE_DAY_WINDOW",
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
  },
  { operation: "CHANGE_TRANSPORT", primaryTransport: "DRIVING" },
  { operation: "CHANGE_BUDGET", amount: 200 },
  { operation: "CHANGE_BUDGET", clear: true },
] as const;

describe("Change Request contracts", () => {
  it("keeps the strict canonical operation set", () => {
    expect(CHANGE_REQUEST_OPERATIONS).toEqual([
      "MOVE_ACTIVITY",
      "CHANGE_TIME",
      "CHANGE_DURATION",
      "ADD_ACTIVITY",
      "REMOVE_ACTIVITY",
      "REPLACE_ACTIVITY",
      "CHANGE_FIXED_BOOKING",
      "CHANGE_DESTINATION",
      "CHANGE_TRIP_DATES",
      "CHANGE_BASE_LOCATION",
      "CHANGE_DAY_WINDOW",
      "CHANGE_TRANSPORT",
      "CHANGE_BUDGET",
    ]);
    for (const change of canonicalChanges) {
      expect(changeRequestChangeSchema.safeParse(change).success).toBe(true);
    }
  });

  it("rejects arbitrary Firestore patch payloads and extra operation fields", () => {
    expect(changeRequestChangeSchema.safeParse({
      operation: "PATCH",
      path: "trips/x/ownerId",
      value: "attacker",
    }).success).toBe(false);
    expect(changeRequestChangeSchema.safeParse({
      operation: "CHANGE_TIME",
      itemId: "item-1",
      targetStartTime: "11:00",
      arbitraryField: true,
    }).success).toBe(false);
  });

  it("does not accept client-supplied authoritative classification", () => {
    expect(createChangeRequestInputSchema.safeParse({
      tripId: "trip-1",
      expectedItineraryVersionId: "version-1",
      classification: "MINOR",
      change: { operation: "REMOVE_ACTIVITY", itemId: "item-1" },
    }).success).toBe(false);
  });

  it("requires current itinerary version assumptions on every public action", () => {
    expect(createChangeRequestInputSchema.safeParse({
      tripId: "trip-1",
      change: { operation: "CHANGE_TIME", itemId: "item-1", targetStartTime: "11:00" },
    }).success).toBe(false);
    expect(reviewChangeRequestInputSchema.safeParse({
      tripId: "trip-1",
      changeRequestId: "cr-1",
      decision: "PROCEED",
    }).success).toBe(false);
    expect(applyChangeRequestInputSchema.safeParse({
      tripId: "trip-1",
      changeRequestId: "cr-1",
    }).success).toBe(false);
  });

  it("keeps fixed booking and budget operations strict", () => {
    expect(changeRequestChangeSchema.safeParse({
      operation: "CHANGE_FIXED_BOOKING",
      action: "UPDATE",
      bookingId: "booking-1",
      date: "2026-10-01",
      startTime: "12:00",
    }).success).toBe(false);
    expect(changeRequestChangeSchema.safeParse({
      operation: "CHANGE_FIXED_BOOKING",
      action: "CANCEL",
      bookingId: "booking-1",
      cancel: true,
      status: "CANCELLED",
    }).success).toBe(false);
    expect(changeRequestChangeSchema.safeParse({
      operation: "CHANGE_BUDGET",
      clear: true,
      amount: 100,
    }).success).toBe(false);
  });
});
