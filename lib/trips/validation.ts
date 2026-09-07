import { isValidDayWindow, isValidTripDateRange } from "@travel-planner/shared";

export function validateTripSetupDates(startDate: string, endDate: string, startTime: string, endTime: string) {
  if (!isValidTripDateRange(startDate, endDate)) return "Choose a valid trip of up to 7 calendar days.";
  if (!isValidDayWindow(startTime, endTime)) return "Daily start time must be before the end time.";
  return null;
}
