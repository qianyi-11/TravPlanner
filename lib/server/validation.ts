import { ApiError } from "./api-error";
import { isValidDateRange, isValidDateString, isValidDayWindow, isValidTimeString } from "../date-time";
import {
  FOOD_PREFERENCES,
  INTERESTS,
  PACES,
  TRANSPORT_MODES,
  type FoodPreference,
  type Interest,
  type MemberPreferences,
  type Pace,
  type TransportMode,
} from "../types";

const MAX_ID_LENGTH = 200;

export async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", "Request body must be valid JSON");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_REQUEST", "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_ID_LENGTH) {
    throw new ApiError(400, "INVALID_ID", `${field} must be a non-empty string`);
  }
  return value.trim();
}

export function requireItineraryRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ApiError(400, "INVALID_ITINERARY_REVISION", "expectedItineraryRevision must be a positive integer");
  }
  return value;
}

export function requireChecklistTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new ApiError(400, "INVALID_CHECKLIST_TITLE", "title must be 1 to 120 characters");
  }
  return value.trim();
}

export function requireOptionalAssignedMemberId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireId(value, "assignedMemberId");
}

export function requireOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new ApiError(400, "INVALID_REQUEST", `${field} must be a boolean`);
  return value;
}

export function requireUniqueIdArray(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {}
): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, "INVALID_ID_ARRAY", `${field} must be an array`);

  const ids = value.map((item, index) => requireId(item, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "DUPLICATE_ID", `${field} must not contain duplicates`);
  if (options.min !== undefined && ids.length < options.min) {
    throw new ApiError(400, "INVALID_ID_ARRAY", `${field} must contain at least ${options.min} item(s)`);
  }
  if (options.max !== undefined && ids.length > options.max) {
    throw new ApiError(400, "INVALID_ID_ARRAY", `${field} must contain at most ${options.max} item(s)`);
  }
  return ids;
}

export function requireShortlistCapacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) {
    throw new ApiError(400, "INVALID_SHORTLIST_CAPACITY", "capacity must be an integer from 1 to 20");
  }
  return value;
}

export function parseCreateTripInput(body: Record<string, unknown>): {
  groupId: string;
  name: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  budgetTotal: number;
  groupSize: number;
  dailyStart: string;
  dailyEnd: string;
  transport: TransportMode;
} {
  const groupId = requireId(body.groupId, "groupId");
  if (body.name !== undefined && typeof body.name !== "string") {
    throw new ApiError(400, "INVALID_REQUEST", "name must be a string");
  }
  if (!Array.isArray(body.destinations) || !body.destinations.length) {
    throw new ApiError(400, "INVALID_REQUEST", "destinations must be a non-empty array");
  }
  const destinations = body.destinations.map((value) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(400, "INVALID_REQUEST", "destinations must contain non-empty strings");
    }
    return value.trim();
  });
  if (new Set(destinations.map((value) => value.toLowerCase())).size !== destinations.length) {
    throw new ApiError(400, "INVALID_REQUEST", "destinations must not contain duplicates");
  }
  if (!isValidDateString(body.startDate) || !isValidDateString(body.endDate)) {
    throw new ApiError(400, "INVALID_DATE", "startDate and endDate must be real dates in YYYY-MM-DD format");
  }
  if (!isValidDateRange(body.startDate, body.endDate)) {
    throw new ApiError(400, "INVALID_DATE_RANGE", "startDate must be on or before endDate");
  }
  if (typeof body.budgetTotal !== "number" || !Number.isFinite(body.budgetTotal) || !Number.isInteger(body.budgetTotal) || body.budgetTotal < 200 || body.budgetTotal > 20000) {
    throw new ApiError(400, "INVALID_BUDGET", "budgetTotal must be an integer from 200 to 20000");
  }
  if (typeof body.groupSize !== "number" || !Number.isInteger(body.groupSize) || body.groupSize < 1 || body.groupSize > 100) {
    throw new ApiError(400, "INVALID_GROUP_SIZE", "groupSize must be an integer from 1 to 100");
  }
  if (!isValidTimeString(body.dailyStart) || !isValidTimeString(body.dailyEnd)) {
    throw new ApiError(400, "INVALID_TIME", "dailyStart and dailyEnd must use HH:MM");
  }
  if (!isValidDayWindow(body.dailyStart, body.dailyEnd)) {
    throw new ApiError(400, "INVALID_DAY_WINDOW", "dailyStart must be before dailyEnd");
  }
  if (typeof body.transport !== "string" || !TRANSPORT_MODES.includes(body.transport as TransportMode)) {
    throw new ApiError(400, "INVALID_TRANSPORT", "transport is invalid");
  }
  return {
    groupId,
    name: (body.name ?? "").trim(),
    destinations,
    startDate: body.startDate,
    endDate: body.endDate,
    budgetTotal: body.budgetTotal,
    groupSize: body.groupSize,
    dailyStart: body.dailyStart,
    dailyEnd: body.dailyEnd,
    transport: body.transport as TransportMode,
  };
}

function preferenceValues<T extends string>(value: unknown, field: string, allowed: readonly T[]): T[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && allowed.includes(item as T))) {
    throw new ApiError(400, "INVALID_PREFERENCES", `${field} contains an invalid value`);
  }
  if (new Set(value).size !== value.length) {
    throw new ApiError(400, "INVALID_PREFERENCES", `${field} must not contain duplicates`);
  }
  return value as T[];
}

function preferenceTags(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new ApiError(400, "INVALID_PREFERENCES", `${field} must be an array with at most 20 items`);
  }
  const tags = value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.trim().length > 120) {
      throw new ApiError(400, "INVALID_PREFERENCES", `${field} must contain non-empty strings up to 120 characters`);
    }
    return item.trim();
  });
  if (new Set(tags).size !== tags.length) {
    throw new ApiError(400, "INVALID_PREFERENCES", `${field} must not contain duplicates`);
  }
  return tags;
}

export function parseMemberPreferences(value: unknown): MemberPreferences {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_PREFERENCES", "preferences must be an object");
  }
  const input = value as Record<string, unknown>;
  const interests = preferenceValues<Interest>(input.interests, "interests", INTERESTS);
  const foodPreferences = preferenceValues<FoodPreference>(input.foodPreferences, "foodPreferences", FOOD_PREFERENCES);
  if (typeof input.pace !== "string" || !PACES.includes(input.pace as Pace)) {
    throw new ApiError(400, "INVALID_PREFERENCES", "pace is invalid");
  }
  if (typeof input.personalBudget !== "number" || !Number.isFinite(input.personalBudget) || input.personalBudget < 100 || input.personalBudget > 8000) {
    throw new ApiError(400, "INVALID_PREFERENCES", "personalBudget must be from 100 to 8000");
  }
  return {
    interests,
    foodPreferences,
    pace: input.pace as Pace,
    mustDo: preferenceTags(input.mustDo, "mustDo"),
    dislikes: preferenceTags(input.dislikes, "dislikes"),
    personalBudget: input.personalBudget,
  };
}
