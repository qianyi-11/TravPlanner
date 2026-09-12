import { isValidDateString } from "./date-time";
import type { PricePressure } from "./types";

const DAY_MS = 86_400_000;

function calendarDate(value: string | Date): string {
  const date = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  if (!isValidDateString(date)) throw new Error("Expected a valid calendar date");
  return date;
}

export function computeBookingPressure(startDate: string, now: string | Date = new Date()): PricePressure {
  const start = calendarDate(startDate);
  const today = calendarDate(now);
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const daysRemaining = Math.round(
    (Date.UTC(startYear, startMonth - 1, startDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / DAY_MS
  );

  if (daysRemaining < 0) {
    return {
      level: "VERY HIGH",
      reasons: ["Departure date has passed; review or update the trip dates."],
      recommendation: "Review trip dates",
    };
  }
  if (daysRemaining > 90) {
    return {
      level: "LOW",
      reasons: [`${daysRemaining} days until departure. Plenty of planning time remains.`],
      recommendation: "Plan at your own pace",
    };
  }
  if (daysRemaining > 30) {
    return {
      level: "MEDIUM",
      reasons: [`${daysRemaining} days until departure. The trip is approaching; confirm key activities.`],
      recommendation: "Confirm key activities",
    };
  }
  if (daysRemaining > 7) {
    return {
      level: "HIGH",
      reasons: [`${daysRemaining} days until departure. Departure is close; review bookings soon.`],
      recommendation: "Review bookings soon",
    };
  }
  return {
    level: "VERY HIGH",
    reasons: [`${daysRemaining} days until departure. Departure is imminent; confirm critical arrangements.`],
    recommendation: "Confirm critical arrangements",
  };
}
