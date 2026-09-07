import { describe, expect, it } from "vitest";
import {
  setActivityBudgetInputSchema,
  setActivityBudgetResultSchema,
  reportFixedBookingInputSchema,
  reportFixedBookingResultSchema,
  confirmFixedBookingInputSchema,
  confirmFixedBookingResultSchema,
  changeFixedBookingInputSchema,
  changeFixedBookingResultSchema,
  fixedBookingDocumentSchema,
  activityBudgetWriteSchema,
  activityBudgetReadSchema,
} from "@travel-planner/shared";
import { Timestamp } from "firebase-admin/firestore";

describe("budgetBookingsContracts", () => {
  describe("setActivityBudgetInputSchema", () => {
    it("accepts valid SET branch", () => {
      const res = setActivityBudgetInputSchema.safeParse({
        tripId: "t1",
        expectedPlanningCycle: 1,
        amount: 250,
      });
      expect(res.success).toBe(true);
    });

    it("accepts valid CLEAR branch", () => {
      const res = setActivityBudgetInputSchema.safeParse({
        tripId: "t1",
        expectedPlanningCycle: 1,
        clear: true,
      });
      expect(res.success).toBe(true);
    });

    it("rejects unknown keys in SET or CLEAR branches", () => {
      expect(
        setActivityBudgetInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          amount: 250,
          extraKey: "bad",
        }).success
      ).toBe(false);

      expect(
        setActivityBudgetInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          clear: true,
          extraKey: "bad",
        }).success
      ).toBe(false);
    });
  });

  describe("setActivityBudgetResultSchema", () => {
    it("rejects safeActivityBudgetCeiling = 0", () => {
      const res = setActivityBudgetResultSchema.safeParse({
        safeActivityBudgetCeiling: 0,
        phase: "COLLECTING",
        planningCycle: 1,
        cleared: false,
      });
      expect(res.success).toBe(false);
    });

    it("accepts positive ceiling or omitted ceiling", () => {
      expect(
        setActivityBudgetResultSchema.safeParse({
          safeActivityBudgetCeiling: 100,
          phase: "COLLECTING",
          planningCycle: 1,
          cleared: false,
        }).success
      ).toBe(true);

      expect(
        setActivityBudgetResultSchema.safeParse({
          phase: "COLLECTING",
          planningCycle: 1,
          cleared: true,
        }).success
      ).toBe(true);
    });

    it("is strict against extra keys", () => {
      expect(
        setActivityBudgetResultSchema.safeParse({
          phase: "COLLECTING",
          planningCycle: 1,
          cleared: true,
          unexpectedField: true,
        }).success
      ).toBe(false);
    });
  });

  describe("reportFixedBookingInputSchema", () => {
    it("requires endTime or durationMinutes", () => {
      expect(
        reportFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          candidateId: "c1",
          date: "2026-10-01",
          startTime: "10:00",
        }).success
      ).toBe(false);

      expect(
        reportFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          candidateId: "c1",
          date: "2026-10-01",
          startTime: "10:00",
          endTime: "11:00",
        }).success
      ).toBe(true);

      expect(
        reportFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          candidateId: "c1",
          date: "2026-10-01",
          startTime: "10:00",
          durationMinutes: 60,
        }).success
      ).toBe(true);
    });
  });

  describe("confirmFixedBookingInputSchema", () => {
    it("validates minimal shape strictly", () => {
      expect(
        confirmFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          bookingId: "b1",
        }).success
      ).toBe(true);

      expect(
        confirmFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          bookingId: "b1",
          extra: 123,
        }).success
      ).toBe(false);
    });
  });

  describe("changeFixedBookingInputSchema", () => {
    it("validates UPDATE branch", () => {
      expect(
        changeFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          bookingId: "b1",
          action: "UPDATE",
          date: "2026-10-01",
          startTime: "10:00",
          endTime: "11:00",
        }).success
      ).toBe(true);

      // Missing end/duration in UPDATE
      expect(
        changeFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          bookingId: "b1",
          action: "UPDATE",
          date: "2026-10-01",
          startTime: "10:00",
        }).success
      ).toBe(false);
    });

    it("validates CANCEL branch", () => {
      expect(
        changeFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          bookingId: "b1",
          action: "CANCEL",
          cancel: true,
        }).success
      ).toBe(true);

      expect(
        changeFixedBookingInputSchema.safeParse({
          tripId: "t1",
          expectedPlanningCycle: 1,
          bookingId: "b1",
          action: "CANCEL",
          cancel: false,
        }).success
      ).toBe(false);
    });
  });

  describe("fixedBookingDocumentSchema", () => {
    const timestamp = Timestamp.now();
    const base = {
      candidateId: "cand1",
      date: "2026-10-01",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      reportedBy: "u1",
      reportedAt: timestamp,
    };

    it("rejects PENDING with confirmedBy or confirmedAt", () => {
      expect(
        fixedBookingDocumentSchema.safeParse({
          ...base,
          status: "PENDING_CONFIRMATION",
          confirmedBy: "u_owner",
        }).success
      ).toBe(false);
    });

    it("rejects CONFIRMED missing confirmedBy or confirmedAt", () => {
      expect(
        fixedBookingDocumentSchema.safeParse({
          ...base,
          status: "CONFIRMED",
        }).success
      ).toBe(false);

      expect(
        fixedBookingDocumentSchema.safeParse({
          ...base,
          status: "CONFIRMED",
          confirmedBy: "u_owner",
          // confirmedAt missing
        }).success
      ).toBe(false);
    });

    it("accepts valid PENDING and CONFIRMED documents", () => {
      expect(
        fixedBookingDocumentSchema.safeParse({
          ...base,
          status: "PENDING_CONFIRMATION",
        }).success
      ).toBe(true);

      expect(
        fixedBookingDocumentSchema.safeParse({
          ...base,
          status: "CONFIRMED",
          confirmedBy: "u_owner",
          confirmedAt: timestamp,
        }).success
      ).toBe(true);
    });
  });

  describe("activityBudgetWriteSchema and activityBudgetReadSchema", () => {
    const timestamp = Timestamp.now();

    it("write schema enforces supported canonical currency and precision", () => {
      expect(
        activityBudgetWriteSchema.safeParse({
          memberId: "u1",
          amount: 10.55,
          currency: "USD",
          planningCycleUpdated: 1,
          updatedAt: timestamp,
        }).success
      ).toBe(true);

      // Excess precision
      expect(
        activityBudgetWriteSchema.safeParse({
          memberId: "u1",
          amount: 10.555,
          currency: "USD",
          planningCycleUpdated: 1,
          updatedAt: timestamp,
        }).success
      ).toBe(false);

      expect(
        activityBudgetWriteSchema.safeParse({
          memberId: "u1",
          amount: 100.55,
          currency: "IDR",
          planningCycleUpdated: 1,
          updatedAt: timestamp,
        }).success
      ).toBe(true);

      expect(
        activityBudgetWriteSchema.safeParse({
          memberId: "u1",
          amount: 100.555,
          currency: "IDR",
          planningCycleUpdated: 1,
          updatedAt: timestamp,
        }).success
      ).toBe(false);

      // Unsupported currency
      expect(
        activityBudgetWriteSchema.safeParse({
          memberId: "u1",
          amount: 10,
          currency: "XYZ",
          planningCycleUpdated: 1,
          updatedAt: timestamp,
        }).success
      ).toBe(false);
    });

    it("read schema allows non-empty legacy/unsupported currency", () => {
      expect(
        activityBudgetReadSchema.safeParse({
          memberId: "u1",
          amount: 10.555,
          currency: "XYZ",
          planningCycleUpdated: 1,
          updatedAt: timestamp,
        }).success
      ).toBe(true);
    });
  });

  describe("result schemas are strict", () => {
    it("reportFixedBookingResultSchema is strict", () => {
      expect(
        reportFixedBookingResultSchema.safeParse({
          bookingId: "b1",
          status: "CONFIRMED",
          phase: "COLLECTING",
          planningCycle: 1,
          extra: true,
        }).success
      ).toBe(false);
    });

    it("confirmFixedBookingResultSchema is strict", () => {
      expect(
        confirmFixedBookingResultSchema.safeParse({
          bookingId: "b1",
          status: "CONFIRMED",
          changed: true,
          phase: "COLLECTING",
          planningCycle: 1,
          extra: true,
        }).success
      ).toBe(false);
    });

    it("changeFixedBookingResultSchema is strict", () => {
      expect(
        changeFixedBookingResultSchema.safeParse({
          bookingId: "b1",
          action: "UPDATE",
          changed: true,
          phase: "COLLECTING",
          planningCycle: 1,
          extra: true,
        }).success
      ).toBe(false);
    });
  });
});
