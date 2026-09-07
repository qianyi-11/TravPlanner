import { describe, expect, it } from "vitest";
import {
  BookingTimingError,
  normalizeBookingTiming,
  normalizeBookingInputOrThrow,
} from "../../functions/src/bookings/normalizeBookingTiming";
import { parsePersistedFixedBookingOrThrow } from "../../functions/src/bookings/parsePersistedBooking";
import { Timestamp } from "firebase-admin/firestore";

describe("Booking Timing Normalization", () => {
  it("accepts 00:00 start", () => {
    const res = normalizeBookingTiming({
      startTime: "00:00",
      durationMinutes: 60,
    });
    expect(res).toEqual({
      startTime: "00:00",
      endTime: "01:00",
      durationMinutes: 60,
    });
  });

  it("accepts 23:59 as end time (e.g. 23:58 -> 23:59)", () => {
    const res = normalizeBookingTiming({
      startTime: "23:58",
      endTime: "23:59",
    });
    expect(res).toEqual({
      startTime: "23:58",
      endTime: "23:59",
      durationMinutes: 1,
    });
  });

  it("rejects 23:59 as a start with positive duration (crosses midnight)", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "23:59",
        durationMinutes: 1,
      })
    ).toThrow(BookingTimingError);
  });

  it("rejects invalid startTime or endTime format/value", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "25:00",
        durationMinutes: 30,
      })
    ).toThrow(BookingTimingError);

    expect(() =>
      normalizeBookingTiming({
        startTime: "10:00",
        endTime: "10:65",
      })
    ).toThrow(BookingTimingError);

    expect(() =>
      normalizeBookingTiming({
        startTime: "not-a-time",
        durationMinutes: 30,
      })
    ).toThrow(BookingTimingError);
  });

  it("rejects when neither endTime nor durationMinutes supplied", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "10:00",
      })
    ).toThrow(BookingTimingError);
  });

  it("rejects equal start and end time", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "10:00",
        endTime: "10:00",
      })
    ).toThrow(BookingTimingError);
  });

  it("rejects zero duration", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "10:00",
        durationMinutes: 0,
      })
    ).toThrow(BookingTimingError);
  });

  it("rejects cross-midnight times (endTime before startTime)", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "23:00",
        endTime: "01:00",
      })
    ).toThrow(BookingTimingError);
  });

  it("derives duration when only endTime is provided", () => {
    const res = normalizeBookingTiming({
      startTime: "10:00",
      endTime: "12:30",
    });
    expect(res).toEqual({
      startTime: "10:00",
      endTime: "12:30",
      durationMinutes: 150,
    });
  });

  it("derives endTime when only durationMinutes is provided", () => {
    const res = normalizeBookingTiming({
      startTime: "14:15",
      durationMinutes: 45,
    });
    expect(res).toEqual({
      startTime: "14:15",
      endTime: "15:00",
      durationMinutes: 45,
    });
  });

  it("validates when both endTime and durationMinutes are consistent", () => {
    const res = normalizeBookingTiming({
      startTime: "09:00",
      endTime: "10:30",
      durationMinutes: 90,
    });
    expect(res).toEqual({
      startTime: "09:00",
      endTime: "10:30",
      durationMinutes: 90,
    });
  });

  it("rejects when both endTime and durationMinutes are inconsistent", () => {
    expect(() =>
      normalizeBookingTiming({
        startTime: "09:00",
        endTime: "10:30",
        durationMinutes: 60,
      })
    ).toThrow(BookingTimingError);
  });

  it("normalizeBookingInputOrThrow maps BookingTimingError to INVALID_INPUT", () => {
    expect(() =>
      normalizeBookingInputOrThrow({
        startTime: "10:00",
        endTime: "09:00",
      })
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ reason: "INVALID_INPUT" }),
      })
    );
  });

  it("parsePersistedFixedBookingOrThrow maps malformed persisted data or timing error to CONFLICT", () => {
    const timestamp = Timestamp.now();
    // Timing error in persisted data
    const invalidTimingBooking = {
      candidateId: "cand1",
      date: "2026-10-01",
      startTime: "23:59",
      durationMinutes: 10,
      status: "PENDING_CONFIRMATION",
      reportedBy: "u1",
      reportedAt: timestamp,
    };
    expect(() =>
      parsePersistedFixedBookingOrThrow(invalidTimingBooking, "b1", "trip1")
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ reason: "CONFLICT" }),
      })
    );

    // Structural error in persisted data (neither endTime nor durationMinutes)
    const malformedBooking = {
      candidateId: "cand1",
      date: "2026-10-01",
      startTime: "10:00",
      status: "PENDING_CONFIRMATION",
      reportedBy: "u1",
      reportedAt: timestamp,
    };
    expect(() =>
      parsePersistedFixedBookingOrThrow(malformedBooking, "b1", "trip1")
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ reason: "CONFLICT" }),
      })
    );
  });
});
