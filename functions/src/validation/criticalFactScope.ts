import type { PersistedCriticalFact } from "@travel-planner/shared";

export function canonicalCacheKey(parts: readonly (string | number)[]): string {
  return JSON.stringify(parts);
}

export function buildPlaceDetailsCacheKey(input: {
  placeId: string;
  timezone: string;
  startDate: string;
  endDate: string;
}): string {
  return canonicalCacheKey([
    "PLACE_DETAILS",
    input.placeId,
    input.timezone,
    input.startDate,
    input.endDate,
  ]);
}

export function buildCriticalFactScopeKey(input: {
  candidateId: string;
  fact: PersistedCriticalFact;
  timezone: string;
}): string {
  switch (input.fact.type) {
    case "DURATION":
      return canonicalCacheKey(["CRITICAL_FACT", input.candidateId, "DURATION"]);
    case "VISIT_WINDOW":
      return canonicalCacheKey([
        "CRITICAL_FACT",
        input.candidateId,
        "VISIT_WINDOW",
        input.timezone,
        input.fact.date,
      ]);
    case "PRICE":
      return canonicalCacheKey([
        "CRITICAL_FACT",
        input.candidateId,
        "PRICE",
        input.fact.currency,
      ]);
  }
}

export function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") {
      const result = maybeTimestamp.toMillis();
      if (Number.isFinite(result)) return result;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      const nanoseconds = typeof maybeTimestamp.nanoseconds === "number"
        ? maybeTimestamp.nanoseconds
        : 0;
      return maybeTimestamp.seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
    }
  }
  throw new TypeError("Expected a Firestore-compatible timestamp");
}

export interface ProposalRecencyRef {
  proposalId: string;
  createdAt: unknown;
}

/** Positive means left is newer than right. */
export function compareProposalRecency(
  left: ProposalRecencyRef,
  right: ProposalRecencyRef,
): number {
  const timeDifference = timestampMillis(left.createdAt) - timestampMillis(right.createdAt);
  if (timeDifference !== 0) return timeDifference;
  return left.proposalId.localeCompare(right.proposalId);
}

export function enumerateInclusiveDateStrings(startDate: string, endDate: string): string[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new RangeError("Invalid date range");
  }
  const dates: string[] = [];
  for (let current = start; current <= end; current += 24 * 60 * 60 * 1000) {
    dates.push(new Date(current).toISOString().slice(0, 10));
    if (dates.length > 7) throw new RangeError("Trip exceeds MVP maximum date range");
  }
  return dates;
}

export function candidateCriticalFactScopeKeys(input: {
  candidateId: string;
  timezone: string;
  startDate: string;
  endDate: string;
  activityBudgetCurrency: string;
}): string[] {
  return [
    buildCriticalFactScopeKey({
      candidateId: input.candidateId,
      timezone: input.timezone,
      fact: { type: "DURATION", durationMinutes: 1 },
    }),
    ...enumerateInclusiveDateStrings(input.startDate, input.endDate).map(date =>
      buildCriticalFactScopeKey({
        candidateId: input.candidateId,
        timezone: input.timezone,
        fact: { type: "VISIT_WINDOW", date, startTime: "00:00", endTime: "00:01" },
      }),
    ),
    buildCriticalFactScopeKey({
      candidateId: input.candidateId,
      timezone: input.timezone,
      fact: {
        type: "PRICE",
        amount: 0,
        costStatus: "ESTIMATED",
        currency: input.activityBudgetCurrency,
      },
    }),
  ];
}
