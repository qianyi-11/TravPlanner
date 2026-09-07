import { describe, expect, it } from "vitest";
import { candidateVoteDocumentSchema, effectiveCandidateActivationVersion, effectiveVoteCandidateActivationVersion, legacyCandidateVoteReadSchema } from "../../shared/schemas/voting";
import { aggregateCandidateVotes, candidateVoteScore, eligibleCandidateVotes } from "../../functions/src/voting/candidateVoteAggregation";
import { carryForwardCandidateVotes } from "../../functions/src/voting/carryForwardCandidateVotes";
import { candidateVoteId, isCandidateVoteIdentity } from "../../functions/src/voting/candidateVoteIdentity";
import { calculateOptionPlurality } from "../../functions/src/voting/optionPlurality";

const timestamps = { createdAt: 0, updatedAt: 0 };

describe("Voting domain", () => {
  it("derives candidate scores and keeps strict writes separate from legacy reads", () => {
    expect(candidateVoteScore("WANT")).toBe(1);
    expect(candidateVoteScore("NEUTRAL")).toBe(0);
    expect(candidateVoteScore("AVOID")).toBe(-1);
    expect(candidateVoteDocumentSchema.safeParse({ candidateId: "c", memberId: "m", value: "WANT", score: 1, planningCycle: 1, ...timestamps }).success).toBe(false);
    expect(legacyCandidateVoteReadSchema.parse({ candidateId: "c", memberId: "m", value: "WANT", score: 1, planningCycle: 1, ...timestamps }).candidateActivationVersion).toBeUndefined();
  });

  it("uses effective activation epochs and filters aggregate inputs", () => {
    expect(effectiveCandidateActivationVersion({})).toBe(1);
    expect(effectiveVoteCandidateActivationVersion({})).toBe(1);
    const votes = [
      { candidateId: "a", memberId: "one", value: "WANT" as const, score: 1 as const, planningCycle: 2 },
      { candidateId: "a", memberId: "two", value: "AVOID" as const, score: -1 as const, planningCycle: 2, candidateActivationVersion: 2 },
      { candidateId: "b", memberId: "one", value: "WANT" as const, score: 1 as const, planningCycle: 1 },
    ];
    expect(eligibleCandidateVotes({ votes, activeMemberIds: ["one", "two"], candidates: [{ candidateId: "a", active: true, activationVersion: 1 }], planningCycle: 2 })).toHaveLength(1);
    expect(aggregateCandidateVotes({ votes, activeMemberIds: ["one", "two"], candidates: [{ candidateId: "a", active: true, activationVersion: 1 }], planningCycle: 2 })).toEqual({ a: { scoreTotal: 1, responseCount: 1, wantCount: 1, neutralCount: 0, avoidCount: 0 } });
    expect(aggregateCandidateVotes({ votes: [{ candidateId: "a", memberId: "one", value: "WANT", score: 1, planningCycle: 2 }], activeMemberIds: ["one"], candidates: [{ candidateId: "a", active: true, activationVersion: 2 }], planningCycle: 2 })).toEqual({});
  });

  it("carries the greatest eligible historical cycle in deterministic order", () => {
    const votes = [
      { candidateId: "b", memberId: "two", value: "NEUTRAL" as const, planningCycle: 1 },
      { candidateId: "a", memberId: "one", value: "WANT" as const, planningCycle: 1 },
      { candidateId: "a", memberId: "one", value: "AVOID" as const, planningCycle: 3 },
    ];
    expect(carryForwardCandidateVotes({ votes, targetPlanningCycle: 4, activeMemberIds: ["one", "two"], candidates: [{ candidateId: "a", active: true }, { candidateId: "b", active: true }] })).toEqual([
      { candidateId: "a", memberId: "one", value: "AVOID", score: -1, planningCycle: 4, candidateActivationVersion: 1 },
      { candidateId: "b", memberId: "two", value: "NEUTRAL", score: 0, planningCycle: 4, candidateActivationVersion: 1 },
    ]);
    expect(carryForwardCandidateVotes({ votes: [{ candidateId: "a", memberId: "one", value: "WANT", planningCycle: 1 }], targetPlanningCycle: 2, activeMemberIds: ["one"], candidates: [{ candidateId: "a", active: true, activationVersion: 2 }] })).toEqual([]);
  });

  it("returns seeded option counts and a true positive top tie", () => {
    expect(calculateOptionPlurality({
      votes: [
        { memberId: "one", planningCycle: 2, optionId: "b" },
        { memberId: "removed", planningCycle: 2, optionId: "a" },
      ],
      activeMemberIds: ["one"],
      eligibleOptionIds: ["a", "b"],
      planningCycle: 2,
    })).toEqual({ optionTotals: { a: 0, b: 1 }, winnerOptionId: "b", tiedOptionIds: ["b"], isTie: false, validVoteCount: 1 });
    expect(candidateVoteId(2, "candidate", "member")).toBe("2_candidate_member");
    expect(isCandidateVoteIdentity("2_candidate_member", { candidateId: "candidate", memberId: "member", planningCycle: 2 })).toBe(true);
  });
});
