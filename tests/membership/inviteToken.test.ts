import { describe, expect, it } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  InviteTokenError,
  parseInviteToken,
  validateInviteToken,
} from "../../functions/src/membership/inviteToken";

describe("invite tokens", () => {
  it("round-trips version and keeps random material secret", () => {
    const first = generateInviteToken(1);
    const second = generateInviteToken(1);

    expect(parseInviteToken(first)).toMatchObject({ version: 1 });
    expect(first).not.toBe(second);
    expect(hashInviteToken(first)).not.toBe(first);
  });

  it.each([
    [generateInviteToken(1), 2, "INVITE_RESET"],
    [generateInviteToken(2), 1, "INVITE_INVALID"],
    ["not-a-token", 1, "INVITE_INVALID"],
  ])("classifies invite credentials", (token, version, reason) => {
    expect(() => validateInviteToken(token, version, hashInviteToken(token))).toThrow(
      new InviteTokenError(reason as "INVITE_INVALID" | "INVITE_RESET"),
    );
  });

  it("rejects a wrong hash at the current version", () => {
    const token = generateInviteToken(1);
    expect(() => validateInviteToken(token, 1, hashInviteToken(generateInviteToken(1))))
      .toThrowError("INVITE_INVALID");
  });
});
