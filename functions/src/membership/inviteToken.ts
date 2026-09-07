import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type InviteTokenReason = "INVITE_INVALID" | "INVITE_RESET";
export interface ParsedInviteToken {
  version: number;
  random: string;
}

export class InviteTokenError extends Error {
  constructor(public readonly reason: InviteTokenReason) {
    super(reason);
    this.name = "InviteTokenError";
  }
}

export function generateInviteToken(version: number): string {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new RangeError("Invite version must be a positive safe integer.");
  }

  return `${version}.${randomBytes(32).toString("base64url")}`;
}

export function parseInviteToken(token: unknown): ParsedInviteToken | null {
  if (typeof token !== "string") return null;

  const match = /^(\d+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || !/^[1-9]\d*$/.test(match[1])) return null;

  const version = Number(match[1]);
  if (!Number.isSafeInteger(version) || Buffer.from(match[2], "base64url").length !== 32) {
    return null;
  }

  return { version, random: match[2] };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function validateInviteToken(
  token: unknown,
  persistedVersion: number,
  expectedHash: string,
): void {
  const parsed = parseInviteToken(token);
  if (!parsed || !Number.isSafeInteger(persistedVersion) || persistedVersion <= 0) {
    throw new InviteTokenError("INVITE_INVALID");
  }

  if (parsed.version < persistedVersion) {
    throw new InviteTokenError("INVITE_RESET");
  }

  if (parsed.version > persistedVersion || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new InviteTokenError("INVITE_INVALID");
  }

  const actual = Buffer.from(hashInviteToken(token as string), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InviteTokenError("INVITE_INVALID");
  }
}
