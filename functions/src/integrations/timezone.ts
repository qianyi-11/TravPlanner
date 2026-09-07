const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateParts(date: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError("Invalid YYYY-MM-DD date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid calendar date");
  }
  return { year, month, day };
}

export function addLocalDateDays(date: string, days: number): string {
  const { year, month, day } = parseDateParts(date);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
}

export function enumerateLocalDates(startDate: string, endDate: string): string[] {
  parseDateParts(startDate);
  parseDateParts(endDate);
  const dates: string[] = [];
  for (let current = startDate; current <= endDate; current = addLocalDateDays(current, 1)) {
    dates.push(current);
    if (dates.length > 370) throw new RangeError("Date range is unexpectedly large");
  }
  return dates;
}

export function weekdayForLocalDate(date: string): number {
  const { year, month, day } = parseDateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function zonedParts(timestampMs: number, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function formatDateInTimeZone(timestampMs: number, timeZone: string): string {
  const value = zonedParts(timestampMs, timeZone);
  return `${value.year.toString().padStart(4, "0")}-${value.month.toString().padStart(2, "0")}-${value.day.toString().padStart(2, "0")}`;
}

export function minuteOfDayInTimeZone(timestampMs: number, timeZone: string): number {
  const value = zonedParts(timestampMs, timeZone);
  return value.hour * 60 + value.minute;
}

/** Converts a local wall-clock date/minute in an IANA zone to an instant. */
export function zonedDateMinuteToUtcMs(
  date: string,
  minute: number,
  timeZone: string,
): number {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    throw new RangeError("Local minute must be an integer from 0 to 1440");
  }
  if (minute === 1440) return zonedDateMinuteToUtcMs(addLocalDateDays(date, 1), 0, timeZone);

  const { year, month, day } = parseDateParts(date);
  const targetHour = Math.floor(minute / 60);
  const targetMinute = minute % 60;
  const targetAsUtc = Date.UTC(year, month - 1, day, targetHour, targetMinute);
  let guess = targetAsUtc;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(guess, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const difference = targetAsUtc - actualAsUtc;
    if (difference === 0) return guess;
    guess += difference;
  }

  const final = zonedParts(guess, timeZone);
  if (
    final.year !== year || final.month !== month || final.day !== day ||
    final.hour !== targetHour || final.minute !== targetMinute
  ) {
    throw new RangeError("Local time is not representable in the requested timezone");
  }
  return guess;
}
