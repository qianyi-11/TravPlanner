import { ApiError } from "./api-error";

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
