import {
  legacyFixedBookingReadSchema,
  type LegacyFixedBookingRead,
} from "@travel-planner/shared";
import { authError } from "../auth";
import {
  BookingTimingError,
  normalizeBookingTiming,
  type NormalizedBookingTiming,
} from "./normalizeBookingTiming";

export interface ParsedPersistedFixedBooking {
  booking: LegacyFixedBookingRead;
  normalizedTiming: NormalizedBookingTiming;
}

/** For persisted Firestore booking reads → CONFLICT */
export function parsePersistedFixedBookingOrThrow(
  data: unknown,
  bookingId: string,
  tripId: string,
): ParsedPersistedFixedBooking {
  const parsed = legacyFixedBookingReadSchema.safeParse(data);
  if (!parsed.success) {
    throw authError("CONFLICT", "Fixed booking state is malformed.", {
      tripId,
      targetId: bookingId,
      issues: parsed.error.issues,
    });
  }

  try {
    const normalizedTiming = normalizeBookingTiming({
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      durationMinutes: parsed.data.durationMinutes,
    });
    return {
      booking: parsed.data,
      normalizedTiming,
    };
  } catch (error) {
    if (error instanceof BookingTimingError) {
      throw authError("CONFLICT", "Fixed booking timing is invalid.", {
        tripId,
        targetId: bookingId,
        detail: error.message,
      });
    }
    throw error;
  }
}
