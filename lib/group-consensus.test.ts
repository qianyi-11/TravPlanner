import assert from "node:assert/strict";
import test from "node:test";
import { buildConsensus, evaluateRescueConsensusImpact } from "./group-consensus";
import type { Interest, Member, Place } from "./types";

function member(
  id: string,
  interests: Interest[] = [],
  options: { mustDo?: string[]; dislikes?: string[] } = {}
): Member {
  return {
    id,
    name: id.toUpperCase(),
    initials: id[0].toUpperCase(),
    avatarColor: "#000",
    preferences: {
      interests,
      foodPreferences: [],
      pace: "Balanced",
      mustDo: options.mustDo ?? [],
      dislikes: options.dislikes ?? [],
      personalBudget: 100,
    },
  };
}

function candidate(
  id: string,
  name: string,
  category: string,
  votedBy: string[] = [],
  extra: Partial<Place> & { budgetCompatibleMemberIds?: string[] } = {}
): Place & { budgetCompatibleMemberIds?: string[] } {
  return {
    id,
    name,
    category,
    area: "City",
    destination: "Test",
    coordinates: { lat: 0, lng: 0 },
    address: "",
    photo: "",
    rating: 0,
    reviewCount: 0,
    priceLevel: 1,
    priceLabel: "Free",
    description: "",
    openingHours: [],
    isOpenNow: true,
    estimatedDurationMinutes: 60,
    reviews: [],
    availability: "available",
    suggestedBy: [],
    voteCount: votedBy.length,
    votedBy,
    ...extra,
  };
}

test("votes normally win, preferences help, and conflicts reduce the base score", () => {
  const members = [member("a", ["Culture"]), member("b"), member("c", [], { dislikes: ["Nightlife"] })];
  const unanimous = candidate("unanimous", "Old Temple", "Temple", ["a", "b", "c"]);
  const majority = candidate("majority", "Central Landmark", "Landmark", ["a", "b"]);
  const preferenceOnly = candidate("preference", "Culture Museum", "Museum");
  const conflicted = candidate("conflicted", "Night Owl", "Nightlife", ["a", "b", "c"]);
  const result = buildConsensus({ members, candidates: [majority, conflicted, preferenceOnly, unanimous], capacity: 4 });

  assert.equal(result.candidateOrder[0], "unanimous");
  assert.equal(result.candidates.majority.baseScore, 4);
  assert.equal(result.candidates.preference.baseScore, 1);
  assert.ok(result.candidateOrder.indexOf("majority") < result.candidateOrder.indexOf("preference"));
  assert.equal(result.candidates.conflicted.dislikeConflictCount, 1);
  assert.equal(result.candidates.conflicted.baseScore, 4);
});

test("exact must-dos are preselected, generic text is ignored, and capacity expands", () => {
  const members = [
    member("a", [], { mustDo: ["teamLab Borderless"] }),
    member("b", [], { mustDo: ["Kinkaku-ji"] }),
    member("c", [], { mustDo: ["want something cultural"] }),
  ];
  const result = buildConsensus({
    members,
    candidates: [
      candidate("c", "Culture Museum", "Museum", ["c"]),
      candidate("b", "Kinkaku-ji (Golden Pavilion)", "Temple"),
      candidate("a", "teamLab Borderless", "Digital Art Museum"),
    ],
    capacity: 1,
  });

  assert.deepEqual(result.shortlist.map((item) => item.candidateId), ["a", "b"]);
  assert.ok(result.shortlist.every((item) => item.selectionReason === "MUST_DO"));
  assert.deepEqual(result.candidates.c.mustDoMemberIds, []);
});

test("the fixed fairness bonus changes a close decision but not a clear winner", () => {
  const members = [member("a", ["Culture"]), member("b", ["Nature"]), member("c", ["Food"])];
  const leader = candidate("leader", "Old Temple", "Temple", ["a", "c"]);
  const close = candidate("close", "Central Square", "Landmark", ["a", "c"]);
  const nature = candidate("nature", "Quiet Park", "Park", ["b"]);
  const result = buildConsensus({ members, candidates: [close, nature, leader], capacity: 2 });

  assert.deepEqual(result.shortlist.map((item) => item.candidateId), ["leader", "nature"]);
  assert.equal(result.shortlist[1].representationBonus, 3);
  assert.equal(result.shortlist[1].selectionReason, "REPRESENTATION");
  assert.deepEqual(result.tradeoffs.map((tradeoff) => ({
    selectedCandidateId: tradeoff.selectedCandidateId,
    baselineCandidateId: tradeoff.baselineCandidateId,
    selectionIndex: tradeoff.selectionIndex,
    representedBeforeCount: tradeoff.representedBeforeCount,
    representedAfterCount: tradeoff.representedAfterCount,
    benefitedMemberIds: tradeoff.benefitedMemberIds,
    newlyRepresentedMemberIds: tradeoff.newlyRepresentedMemberIds,
  })), [{
    selectedCandidateId: "nature",
    baselineCandidateId: "close",
    selectionIndex: 1,
    representedBeforeCount: 2,
    representedAfterCount: 3,
    benefitedMemberIds: ["b"],
    newlyRepresentedMemberIds: ["b"],
  }]);
  assert.match(result.tradeoffs[0].explanation, /B their first represented activity/);
  assert.match(result.tradeoffs[0].explanation, /from 2\/3 to 3\/3/);
  assert.match(result.tradeoffs[0].explanation, /one fewer vote/);

  assert.deepEqual(buildConsensus({ members, candidates: [close, nature, leader], capacity: 3 }).tradeoffs, []);

  const overwhelming = candidate("clear", "City Icon", "Landmark", ["a", "b", "c"]);
  const weak = candidate("weak", "Small Park", "Park", ["b"]);
  const clearResult = buildConsensus({ members, candidates: [weak, overwhelming], capacity: 1 });
  assert.equal(clearResult.shortlist[0].candidateId, "clear");
  assert.deepEqual(clearResult.tradeoffs, []);
});

test("tradeoffs describe multiple and equal vote differences accurately", () => {
  const multipleMembers = [
    member("a", ["Culture", "Nature"]), member("b", ["Culture"]), member("c", ["Culture"]),
    member("d", ["Culture"]), member("e", ["Culture"]), member("f", ["Nature"]),
  ];
  const lead = candidate("lead", "Lead Temple", "Temple", ["a", "b", "c", "d", "e"]);
  const fiveVotes = candidate("five", "Five", "Landmark", ["a", "b", "c", "d", "e"]);
  const threeVotes = candidate("three", "Three Park", "Park", ["a", "b", "f"]);
  const multiple = buildConsensus({ members: multipleMembers, candidates: [lead, fiveVotes, threeVotes], capacity: 2 });
  assert.equal(multiple.tradeoffs.length, 1);
  assert.match(multiple.tradeoffs[0].explanation, /2 fewer votes/);
  assert.doesNotMatch(multiple.tradeoffs[0].explanation, /one fewer vote/);

  const equalMembers = [
    member("a", ["Culture", "Nature"]), member("b", ["Culture"]), member("c", ["Culture"]),
    member("d"), member("e"), member("f", ["Nature"]),
  ];
  const fourVotes = candidate("four", "Four Temple", "Temple", ["a", "b", "c", "d"]);
  const fourNature = candidate("nature", "Four Park", "Park", ["a", "d", "e", "f"]);
  const equal = buildConsensus({ members: equalMembers, candidates: [lead, fourVotes, fourNature], capacity: 2 });
  assert.equal(equal.tradeoffs.length, 1);
  assert.match(equal.tradeoffs[0].explanation, /same vote support/);
  assert.doesNotMatch(equal.tradeoffs[0].explanation, /fewer vote/);
});

test("order-only fairness changes and must-do insertion do not create tradeoffs", () => {
  const members = [member("a", ["Culture"]), member("b", ["Nature"]), member("c", ["Food"])];
  const leader = candidate("leader", "Old Temple", "Temple", ["a", "c"]);
  const nature = candidate("nature", "Quiet Park", "Park", ["b"]);
  assert.deepEqual(buildConsensus({ members, candidates: [nature, leader], capacity: 2 }).tradeoffs, []);

  const mustDoMembers = [member("a", [], { mustDo: ["Required Stop"] }), member("b", ["Nature"])];
  const mustDoResult = buildConsensus({
    members: mustDoMembers,
    candidates: [candidate("must", "Required Stop", "Landmark"), candidate("park", "Park", "Park", ["b"])],
    capacity: 1,
  });
  assert.deepEqual(mustDoResult.tradeoffs, []);
});

test("tradeoff fallback pairs final membership rather than a later-selected round winner", () => {
  const members = [member("m", ["Nature"], { dislikes: ["Nightlife"] })];
  const a = candidate("a", "A", "Landmark");
  const b = candidate("b", "B", "Landmark");
  const c = candidate("c", "C Park Nightlife", "Park Nightlife");
  const result = buildConsensus({ members, candidates: [c, b, a], capacity: 2 });

  assert.deepEqual(result.shortlist.map((item) => item.candidateId), ["c", "a"]);
  assert.deepEqual(result.tradeoffs.map((item) => [item.selectedCandidateId, item.baselineCandidateId]), [["c", "b"]]);
  assert.match(result.tradeoffs[0].explanation, /C Park Nightlife is included instead of B/);
});

test("multiple fairness events pair baseline candidates once and remain deterministic", () => {
  const members = [member("a", ["Culture"]), member("b", ["Culture"]), member("c", ["Nature"]), member("d", ["Food"])];
  const candidates = [
    candidate("lead", "Lead Temple", "Temple", ["a", "b"]),
    candidate("x", "X", "Landmark", ["a", "b"]),
    candidate("y", "Y", "Landmark", ["a", "b"]),
    candidate("c", "C Park", "Park", ["c"]),
    candidate("d", "D Restaurant", "Restaurant", ["d"]),
  ];
  const first = buildConsensus({ members, candidates, capacity: 3 });
  const reordered = buildConsensus({ members: [...members].reverse(), candidates: [...candidates].reverse(), capacity: 3 });

  assert.deepEqual(first.shortlist.map((item) => item.candidateId), ["lead", "c", "d"]);
  assert.deepEqual(first.tradeoffs.map((item) => [item.selectedCandidateId, item.baselineCandidateId]), [["c", "x"], ["d", "y"]]);
  assert.equal(new Set(first.tradeoffs.map((item) => item.baselineCandidateId)).size, 2);
  assert.deepEqual(reordered, first);
});

test("already represented members use balance wording, not first-coverage wording", () => {
  const members = [member("a", ["Nature"], { mustDo: ["Required Stop"], dislikes: ["Nightlife"] })];
  const result = buildConsensus({
    members,
    candidates: [
      candidate("must", "Required Stop", "Landmark", ["a"]),
      candidate("plain", "Plain", "Landmark"),
      candidate("balanced", "Balanced Park Nightlife", "Park Nightlife"),
    ],
    capacity: 2,
  });

  assert.equal(result.tradeoffs.length, 1);
  assert.equal(result.tradeoffs[0].representedBeforeCount, 1);
  assert.equal(result.tradeoffs[0].representedAfterCount, 1);
  assert.deepEqual(result.tradeoffs[0].newlyRepresentedMemberIds, []);
  assert.match(result.tradeoffs[0].explanation, /strengthens coverage/);
  assert.doesNotMatch(result.tradeoffs[0].explanation, /first represented|from 1\/1 to 1\/1/);
});

test("ties, reordered inputs, and repeated inputs remain deterministic", () => {
  const members = [member("a")];
  const a = candidate("a-place", "A", "Landmark", ["a"]);
  const b = candidate("b-place", "B", "Landmark", ["a"]);
  const first = buildConsensus({ members, candidates: [b, a], capacity: 2 });
  const second = buildConsensus({ members: [...members].reverse(), candidates: [a, b], capacity: 2 });

  assert.deepEqual(first.shortlist, second.shortlist);
  assert.equal(first.shortlist[0].candidateId, "a-place");
  assert.deepEqual(buildConsensus({ members, candidates: [b, a], capacity: 2 }), first);
});

test("one-member and no-budget cases are stable; complete budget evidence affects Group Match", () => {
  const members = [member("a"), member("b")];
  const plain = candidate("plain", "Plain", "Landmark", ["a"]);
  const budget = candidate("budget", "Budget", "Landmark", ["a"], { budgetCompatibleMemberIds: ["a", "b"] });
  const result = buildConsensus({ members, candidates: [plain, budget], capacity: 2 });

  assert.equal(result.candidates.plain.budgetKnownCount, 0);
  assert.equal(result.candidates.plain.groupMatchPercent, 35);
  assert.equal(result.candidates.budget.budgetKnownCount, 2);
  assert.equal(result.candidates.budget.groupMatchPercent, 45);

  const solo = buildConsensus({ members: [member("solo", ["Nature"])], candidates: [candidate("park", "Park", "Park")], capacity: 1 });
  assert.equal(solo.representedMemberCount, 1);
  assert.equal(solo.representationPercent, 100);
});

test("Rescue impact marks small losses safe and clearly surfaces large losses", () => {
  const members = [member("a", ["Culture"]), member("b", ["Culture"]), member("c"), member("d")];
  const original = candidate("original", "Old Temple", "Temple", ["a", "b", "c", "d"]);
  const similar = candidate("similar", "New Shrine", "Shrine", ["a", "b", "c", "d"]);
  const poor = candidate("poor", "Unmatched Stop", "Transit");

  const safe = evaluateRescueConsensusImpact({ members, original, replacement: similar });
  const unsafe = evaluateRescueConsensusImpact({ members, original, replacement: poor });
  assert.equal(safe.consensusSafe, true);
  assert.equal(Math.max(0, -safe.change), 0);
  assert.equal(unsafe.consensusSafe, false);
  assert.ok(unsafe.change < -10);
  assert.match(unsafe.reason, /reduces group match/i);
});
