import assert from "node:assert/strict";
import test from "node:test";
import { isValidDateRange, isValidDateString, isValidDayWindow, isValidTimeString, timeToMinutes } from "./date-time";

test("validates real Gregorian dates and date ranges", () => {
  for (const value of ["2026-09-11", "2028-02-29", "2000-02-29"]) assert.equal(isValidDateString(value), true, value);
  for (const value of ["2026-02-29", "1900-02-29", "2026-13-01", "2026-01-32", "2026-1-01", "not-a-date"]) {
    assert.equal(isValidDateString(value), false, value);
  }
  assert.equal(isValidDateRange("2026-09-11", "2026-09-11"), true);
  assert.equal(isValidDateRange("2026-09-11", "2026-09-12"), true);
  assert.equal(isValidDateRange("2026-09-12", "2026-09-11"), false);
});

test("parses strict times and validates same-day windows", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("23:59"), 1439);
  for (const value of ["8:00", "25:00", "12:60", "abc", null]) {
    assert.equal(timeToMinutes(value), null, String(value));
    assert.equal(isValidTimeString(value), false, String(value));
  }
  assert.equal(isValidDayWindow("08:00", "22:00"), true);
  assert.equal(isValidDayWindow("08:00", "08:00"), false);
  assert.equal(isValidDayWindow("22:00", "08:00"), false);
});
