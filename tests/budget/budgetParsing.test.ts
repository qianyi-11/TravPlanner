import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { parseBudgetForMembership } from "../../functions/src/budget/parseBudgetForMembership";
import { HttpsError } from "firebase-functions/v2/https";

describe("parseBudgetForMembership", () => {
  const validTimestamp = Timestamp.now();

  it("parses valid budget correctly", () => {
    const raw = {
      memberId: "u123",
      amount: 150.5,
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: validTimestamp,
    };
    const result = parseBudgetForMembership(raw, "u123", "trip1");
    expect(result).toEqual({
      memberId: "u123",
      amount: 150.5,
      currency: "USD",
    });
  });

  it("throws CONFLICT on malformed amount", () => {
    const raw = {
      memberId: "u123",
      amount: "not-a-number",
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: validTimestamp,
    };
    expect(() => parseBudgetForMembership(raw, "u123", "trip1")).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ reason: "CONFLICT" }) })
    );
  });

  it("throws CONFLICT on missing fields", () => {
    const raw = {
      memberId: "u123",
      // amount missing
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: validTimestamp,
    };
    expect(() => parseBudgetForMembership(raw, "u123", "trip1")).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ reason: "CONFLICT" }) })
    );
  });

  it("throws CONFLICT on memberId !== documentId mismatch", () => {
    const raw = {
      memberId: "u123",
      amount: 200,
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: validTimestamp,
    };
    expect(() => parseBudgetForMembership(raw, "other_doc_id", "trip1")).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ reason: "CONFLICT" }) })
    );
  });

  it("throws CONFLICT on non-positive amount", () => {
    const rawZero = {
      memberId: "u123",
      amount: 0,
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: validTimestamp,
    };
    expect(() => parseBudgetForMembership(rawZero, "u123", "trip1")).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ reason: "CONFLICT" }) })
    );

    const rawNegative = {
      memberId: "u123",
      amount: -50,
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: validTimestamp,
    };
    expect(() => parseBudgetForMembership(rawNegative, "u123", "trip1")).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ reason: "CONFLICT" }) })
    );
  });
});
