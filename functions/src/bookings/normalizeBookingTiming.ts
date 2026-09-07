import { timeToMinutes } from "@travel-planner/shared";
import { authError } from "../auth";

export class BookingTimingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingTimingError";
  }
}

export interface BookingTimingInput {
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
}

export interface NormalizedBookingTiming {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeBookingTiming(input: BookingTimingInput): NormalizedBookingTiming {
  const startMinutes = timeToMinutes(input.startTime);
  if (startMinutes === null) {
    throw new BookingTimingError(`Invalid startTime format or value: "${input.startTime}"`);
  }

  if (input.endTime === undefined && input.durationMinutes === undefined) {
    throw new BookingTimingError("At least one of endTime or durationMinutes is required");
  }

  if (input.durationMinutes !== undefined) {
    if (
      typeof input.durationMinutes !== "number" ||
      !Number.isFinite(input.durationMinutes) ||
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes <= 0
    ) {
      throw new BookingTimingError("durationMinutes must be a finite positive integer");
    }
  }

  if (input.endTime !== undefined) {
    const endMinutes = timeToMinutes(input.endTime);
    if (endMinutes === null) {
      throw new BookingTimingError(`Invalid endTime format or value: "${input.endTime}"`);
    }
  }

  if (input.endTime !== undefined && input.durationMinutes !== undefined) {
    const endMinutes = timeToMinutes(input.endTime)!;
    if (endMinutes <= startMinutes) {
      throw new BookingTimingError("endTime must be strictly after startTime");
    }
    const expectedEndMinutes = startMinutes + input.durationMinutes;
    if (expectedEndMinutes > 1439) {
      throw new BookingTimingError("Booking crosses midnight");
    }
    if (endMinutes !== expectedEndMinutes) {
      throw new BookingTimingError("endTime does not match startTime + durationMinutes");
    }
    return {
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes: input.durationMinutes,
    };
  }

  if (input.endTime !== undefined) {
    const endMinutes = timeToMinutes(input.endTime)!;
    if (endMinutes <= startMinutes) {
      throw new BookingTimingError("endTime must be strictly after startTime");
    }
    return {
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes: endMinutes - startMinutes,
    };
  }

  // input.durationMinutes !== undefined
  const durationMinutes = input.durationMinutes!;
  const endMinutes = startMinutes + durationMinutes;
  if (endMinutes > 1439) {
    throw new BookingTimingError("Booking crosses midnight");
  }

  return {
    startTime: input.startTime,
    endTime: minutesToTime(endMinutes),
    durationMinutes,
  };
}

/** For public callable input validation → INVALID_INPUT */
export function normalizeBookingInputOrThrow(input: BookingTimingInput): NormalizedBookingTiming {
  try {
    return normalizeBookingTiming(input);
  } catch (error) {
    if (error instanceof BookingTimingError) {
      throw authError("INVALID_INPUT", error.message);
    }
    throw error;
  }
}
