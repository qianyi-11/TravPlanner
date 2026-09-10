import type { Member, Place } from "./types";

type ConsensusMember = Pick<Member, "id" | "name" | "preferences">;
type ConsensusCandidate = Pick<Place, "id" | "name" | "category" | "area" | "description" | "votedBy"> & {
  budgetCompatibleMemberIds?: string[];
};

export interface MemberCandidateSignal {
  memberId: string;
  voted: boolean;
  preferenceMatch: boolean;
  matchedPreferenceLabels: string[];
  dislikeConflict: boolean;
  exactMustDo: boolean;
  budgetCompatible?: boolean;
}

export interface CandidateConsensus {
  candidateId: string;
  voteCount: number;
  preferenceMatchCount: number;
  dislikeConflictCount: number;
  mustDoMemberIds: string[];
  budgetKnownCount: number;
  budgetCompatibleCount: number;
  baseScore: number;
  groupMatchPercent: number;
  memberSignals: MemberCandidateSignal[];
}

export interface SelectedConsensusCandidate {
  candidateId: string;
  baseScore: number;
  fairScore: number;
  representationBonus: 0 | 3;
  selectionReason: "MUST_DO" | "CONSENSUS" | "REPRESENTATION";
  reason: string;
}

export interface ConsensusTradeoff {
  selectedCandidateId: string;
  baselineCandidateId: string;
  selectionIndex: number;
  representedBeforeCount: number;
  representedAfterCount: number;
  benefitedMemberIds: string[];
  newlyRepresentedMemberIds: string[];
  explanation: string;
}

export interface ConsensusResult {
  candidates: Record<string, CandidateConsensus>;
  candidateOrder: string[];
  shortlist: SelectedConsensusCandidate[];
  memberRepresentation: { memberId: string; selectedMatchCount: number }[];
  representedMemberCount: number;
  representationPercent: number;
  tradeoffs: ConsensusTradeoff[];
}

type ProvisionalFairnessEvent = Omit<ConsensusTradeoff, "baselineCandidateId" | "explanation"> & {
  roundBaseWinnerId: string;
};

const INTEREST_ALIASES: Record<string, string[]> = {
  food: ["food", "restaurant", "market", "cafe", "ramen", "dining", "dessert", "seafood", "soba"],
  shopping: ["shopping", "market", "mall", "boutique"],
  nature: ["nature", "park", "garden", "forest", "hiking", "bamboo"],
  culture: ["culture", "temple", "shrine", "heritage", "museum"],
  history: ["history", "historic", "temple", "shrine", "castle", "heritage"],
  adventure: ["adventure", "hiking", "climb", "mountain", "theme park"],
  photography: ["photography", "photo", "views", "observatory", "observation", "landmark"],
  nightlife: ["nightlife", "bar", "bars", "entertainment"],
  relaxation: ["relaxation", "tranquil", "peaceful", "calm", "garden", "park"],
  museums: ["museum"],
  architecture: ["architecture", "temple", "shrine", "castle", "building", "tower", "pavilion"],
};

const FOOD_ALIASES: Record<string, string[]> = {
  "local food": ["local food", "street food", "ramen", "soba", "seafood", "market"],
  "fine dining": ["fine dining"],
  "street food": ["street food", "market", "stalls"],
  halal: ["halal"],
  vegetarian: ["vegetarian"],
  cafe: ["cafe"],
  dessert: ["dessert", "sweets", "crepe", "crepes"],
};

const DISLIKE_ALIASES: Record<string, string[]> = {
  nightlife: INTEREST_ALIASES.nightlife,
  seafood: ["seafood"],
  "shopping malls": ["shopping mall", "shopping malls"],
  "theme parks": ["theme park", "theme parks"],
  "long queues": ["long queue", "long queues"],
  "very early mornings": ["very early morning", "very early mornings"],
  "too much walking": ["too much walking"],
  "crowded bars": ["crowded bar", "crowded bars"],
};

export function normalizeConsensusText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${normalizeConsensusText(phrase)} `);
}

function candidateText(candidate: ConsensusCandidate): string {
  return normalizeConsensusText([candidate.name, candidate.category, candidate.area, candidate.description].join(" "));
}

function matchesAliases(text: string, label: string, aliases: Record<string, string[]>): boolean {
  const normalized = normalizeConsensusText(label);
  return (aliases[normalized] ?? [normalized]).some((alias) => containsPhrase(text, alias));
}

function isExplicitMustDo(candidateName: string, mustDo: string): boolean {
  const candidate = normalizeConsensusText(candidateName);
  const requested = normalizeConsensusText(mustDo);
  if (!requested) return false;
  if (candidate === requested) return true;
  return requested.split(" ").length >= 2 && (candidate.startsWith(`${requested} `) || requested.startsWith(`${candidate} `));
}

function roundedFive(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / 5) * 5));
}

function represents(signal: MemberCandidateSignal): boolean {
  return signal.voted || signal.preferenceMatch || signal.exactMustDo;
}

function compareCandidates(a: CandidateConsensus, b: CandidateConsensus): number {
  return (
    b.baseScore - a.baseScore ||
    b.voteCount - a.voteCount ||
    b.preferenceMatchCount - a.preferenceMatchCount ||
    a.dislikeConflictCount - b.dislikeConflictCount ||
    compareIds(a.candidateId, b.candidateId)
  );
}

function describeCandidate(candidate: CandidateConsensus, memberCount: number): string {
  const parts = candidate.voteCount
    ? [`Supported by ${candidate.voteCount} of ${memberCount} travellers`]
    : candidate.preferenceMatchCount
      ? [`Matches preferences for ${candidate.preferenceMatchCount} of ${memberCount} travellers`]
      : ["No strong group signal yet"];
  if (candidate.preferenceMatchCount && candidate.voteCount) {
    parts.push(`matches preferences for ${candidate.preferenceMatchCount} of ${memberCount}`);
  }
  if (candidate.dislikeConflictCount) {
    parts.push(`has ${candidate.dislikeConflictCount} confirmed preference conflict${candidate.dislikeConflictCount === 1 ? "" : "s"}`);
  }
  return `${parts.join(" and ")}.`;
}

function describeTradeoff(
  selected: ConsensusCandidate,
  baseline: ConsensusCandidate,
  event: ProvisionalFairnessEvent,
  candidates: Record<string, CandidateConsensus>,
  members: ConsensusMember[]
): string {
  const selectedVotes = candidates[selected.id].voteCount;
  const baselineVotes = candidates[baseline.id].voteCount;
  const voteDelta = selectedVotes - baselineVotes;
  const voteComparison = voteDelta === -1
    ? "while receiving one fewer vote"
    : voteDelta < -1
      ? `while receiving ${Math.abs(voteDelta)} fewer votes`
      : voteDelta === 0
        ? "with the same vote support"
        : "while also receiving stronger vote support";
  const memberNames = new Map(members.map((member) => [member.id, member.name]));

  if (event.newlyRepresentedMemberIds.length) {
    const names = event.newlyRepresentedMemberIds.map((id) => memberNames.get(id) ?? id);
    const subject = names.join(" and ");
    return `With the representation adjustment, ${selected.name} is included instead of ${baseline.name}. ${selected.name} gives ${subject} ${names.length === 1 ? "their first represented activity" : "their first represented activities"} and improves traveller representation from ${event.representedBeforeCount}/${members.length} to ${event.representedAfterCount}/${members.length}, ${voteComparison}.`;
  }

  const names = event.benefitedMemberIds.map((id) => memberNames.get(id) ?? id).join(" and ");
  return `With the representation adjustment, ${selected.name} is included instead of ${baseline.name}. It strengthens coverage for ${names}, who had fewer represented activities at this point in the shortlist selection, ${voteComparison}.`;
}

function evaluateCandidate(
  memberList: ConsensusMember[],
  candidate: ConsensusCandidate
): CandidateConsensus {
  const text = candidateText(candidate);
  const activeIds = new Set(memberList.map((member) => member.id));
  const voters = new Set(candidate.votedBy.filter((id) => activeIds.has(id)));
  const budgetIds = candidate.budgetCompatibleMemberIds && new Set(candidate.budgetCompatibleMemberIds);
  const memberSignals = memberList.map((member): MemberCandidateSignal => {
    const preferences = member.preferences;
    const matchedPreferenceLabels = preferences
      ? [
          ...preferences.interests.filter((label) => matchesAliases(text, label, INTEREST_ALIASES)),
          ...preferences.foodPreferences.filter((label) => matchesAliases(text, label, FOOD_ALIASES)),
        ]
      : [];
    return {
      memberId: member.id,
      voted: voters.has(member.id),
      preferenceMatch: matchedPreferenceLabels.length > 0,
      matchedPreferenceLabels: [...new Set(matchedPreferenceLabels)].sort(),
      dislikeConflict: preferences?.dislikes.some((label) => matchesAliases(text, label, DISLIKE_ALIASES)) ?? false,
      exactMustDo: preferences?.mustDo.some((label) => isExplicitMustDo(candidate.name, label)) ?? false,
      budgetCompatible: budgetIds?.has(member.id),
    };
  });
  const preferenceMatchCount = memberSignals.filter((signal) => signal.preferenceMatch).length;
  const dislikeConflictCount = memberSignals.filter((signal) => signal.dislikeConflict).length;
  const budgetKnownCount = budgetIds ? memberList.length : 0;
  const budgetCompatibleCount = budgetIds ? memberSignals.filter((signal) => signal.budgetCompatible).length : 0;
  const memberCount = memberList.length;
  const rawGroupMatch = memberCount
    ? budgetKnownCount === memberCount
      ? 55 * (voters.size / memberCount) + 30 * (preferenceMatchCount / memberCount) + 15 * (budgetCompatibleCount / memberCount) - 20 * (dislikeConflictCount / memberCount)
      : 65 * (voters.size / memberCount) + 35 * (preferenceMatchCount / memberCount) - 20 * (dislikeConflictCount / memberCount)
    : 0;
  return {
    candidateId: candidate.id,
    voteCount: voters.size,
    preferenceMatchCount,
    dislikeConflictCount,
    mustDoMemberIds: memberSignals.filter((signal) => signal.exactMustDo).map((signal) => signal.memberId),
    budgetKnownCount,
    budgetCompatibleCount,
    baseScore: 2 * voters.size + preferenceMatchCount - 2 * dislikeConflictCount,
    groupMatchPercent: roundedFive(rawGroupMatch),
    memberSignals,
  };
}

export function buildConsensus({
  members,
  candidates,
  capacity,
}: {
  members: ConsensusMember[];
  candidates: ConsensusCandidate[];
  capacity: number;
}): ConsensusResult {
  const memberList = [...members].sort((a, b) => compareIds(a.id, b.id));
  const candidateList = [...candidates].sort((a, b) => compareIds(a.id, b.id));
  const evaluated = candidateList.map((candidate) => evaluateCandidate(memberList, candidate));
  const candidatesById = Object.fromEntries(evaluated.map((candidate) => [candidate.candidateId, candidate]));
  const candidateOrder = [...evaluated].sort(compareCandidates).map((candidate) => candidate.candidateId);
  const representation = new Map(memberList.map((member) => [member.id, 0]));
  const selected: SelectedConsensusCandidate[] = [];
  const provisionalFairnessEvents: ProvisionalFairnessEvent[] = [];
  const remaining = new Map(evaluated.map((candidate) => [candidate.candidateId, candidate]));
  const mustDos = evaluated
    .filter((candidate) => candidate.mustDoMemberIds.length)
    .sort((a, b) =>
      b.mustDoMemberIds.length - a.mustDoMemberIds.length ||
      b.baseScore - a.baseScore ||
      b.voteCount - a.voteCount ||
      compareIds(a.candidateId, b.candidateId)
    );

  function addRepresentation(candidate: CandidateConsensus) {
    for (const signal of candidate.memberSignals) {
      if (represents(signal)) representation.set(signal.memberId, (representation.get(signal.memberId) ?? 0) + 1);
    }
  }

  for (const candidate of mustDos) {
    const names = candidate.mustDoMemberIds.map((id) => memberList.find((member) => member.id === id)?.name ?? id);
    selected.push({
      candidateId: candidate.candidateId,
      baseScore: candidate.baseScore,
      fairScore: candidate.baseScore,
      representationBonus: 0,
      selectionReason: "MUST_DO",
      reason: `${names.join(" and ")} marked this place as a must-do, with support from ${candidate.voteCount} of ${memberList.length} travellers.`,
    });
    remaining.delete(candidate.candidateId);
    addRepresentation(candidate);
  }

  const effectiveCapacity = Math.min(candidateList.length, Math.max(0, capacity, mustDos.length));
  const mustDoIds = new Set(mustDos.map((candidate) => candidate.candidateId));
  const baselineShortlistIds = [
    ...mustDos.map((candidate) => candidate.candidateId),
    ...evaluated
      .filter((candidate) => !mustDoIds.has(candidate.candidateId))
      .sort(compareCandidates)
      .slice(0, effectiveCapacity - mustDos.length)
      .map((candidate) => candidate.candidateId),
  ];
  while (selected.length < effectiveCapacity && remaining.size) {
    const representedBeforeCount = [...representation.values()].filter((count) => count > 0).length;
    const minimum = memberList.length ? Math.min(...representation.values()) : 0;
    const underRepresented = new Set(
      memberList.filter((member) => representation.get(member.id) === minimum).map((member) => member.id)
    );
    const choices = [...remaining.values()].map((candidate) => {
      const representedIds = candidate.memberSignals
        .filter((signal) => underRepresented.has(signal.memberId) && represents(signal))
        .map((signal) => signal.memberId);
      const representationBonus: 0 | 3 = representedIds.length ? 3 : 0;
      return { candidate, representedIds, representationBonus, fairScore: candidate.baseScore + representationBonus };
    });
    choices.sort((a, b) =>
      b.fairScore - a.fairScore ||
      compareCandidates(a.candidate, b.candidate)
    );
    const winner = choices[0];
    const baseWinner = [...remaining.values()].sort(compareCandidates)[0];
    const changedOrder = winner.candidate.candidateId !== baseWinner.candidateId;
    const newlyRepresentedMemberIds = winner.representedIds.filter((id) => representation.get(id) === 0);
    const representedNames = winner.representedIds.map((id) => memberList.find((member) => member.id === id)?.name ?? id);
    selected.push({
      candidateId: winner.candidate.candidateId,
      baseScore: winner.candidate.baseScore,
      fairScore: winner.fairScore,
      representationBonus: winner.representationBonus,
      selectionReason: changedOrder ? "REPRESENTATION" : "CONSENSUS",
      reason: changedOrder
        ? `Selected partly because it represents ${representedNames.join(" and ")}, who ${representedNames.length === 1 ? "was" : "were"} under-represented in the current shortlist.`
        : describeCandidate(winner.candidate, memberList.length),
    });
    remaining.delete(winner.candidate.candidateId);
    addRepresentation(winner.candidate);
    if (changedOrder) {
      provisionalFairnessEvents.push({
        selectedCandidateId: winner.candidate.candidateId,
        roundBaseWinnerId: baseWinner.candidateId,
        selectionIndex: selected.length - 1,
        representedBeforeCount,
        representedAfterCount: [...representation.values()].filter((count) => count > 0).length,
        benefitedMemberIds: winner.representedIds,
        newlyRepresentedMemberIds,
      });
    }
  }

  const memberRepresentation = memberList.map((member) => ({
    memberId: member.id,
    selectedMatchCount: representation.get(member.id) ?? 0,
  }));
  const representedMemberCount = memberRepresentation.filter((member) => member.selectedMatchCount > 0).length;
  const fairShortlistIds = selected.map((candidate) => candidate.candidateId);
  const fairShortlistIdSet = new Set(fairShortlistIds);
  const baselineShortlistIdSet = new Set(baselineShortlistIds);
  const fairOnly = new Set(fairShortlistIds.filter((id) => !baselineShortlistIdSet.has(id)));
  const baselineOnly = baselineShortlistIds.filter((id) => !fairShortlistIdSet.has(id));
  const unusedBaselineIds = new Set(baselineOnly);
  const candidatesByInputId = new Map(candidateList.map((candidate) => [candidate.id, candidate]));
  const tradeoffs: ConsensusTradeoff[] = [];

  if (fairOnly.size === baselineOnly.length) {
    for (const event of provisionalFairnessEvents) {
      if (!fairOnly.has(event.selectedCandidateId)) continue;
      const baselineCandidateId = unusedBaselineIds.has(event.roundBaseWinnerId)
        ? event.roundBaseWinnerId
        : baselineOnly.find((id) => unusedBaselineIds.has(id));
      const selectedCandidate = candidatesByInputId.get(event.selectedCandidateId);
      const baselineCandidate = baselineCandidateId && candidatesByInputId.get(baselineCandidateId);
      if (!baselineCandidateId || !selectedCandidate || !baselineCandidate) continue;
      unusedBaselineIds.delete(baselineCandidateId);
      tradeoffs.push({
        selectedCandidateId: event.selectedCandidateId,
        baselineCandidateId,
        selectionIndex: event.selectionIndex,
        representedBeforeCount: event.representedBeforeCount,
        representedAfterCount: event.representedAfterCount,
        benefitedMemberIds: event.benefitedMemberIds,
        newlyRepresentedMemberIds: event.newlyRepresentedMemberIds,
        explanation: describeTradeoff(selectedCandidate, baselineCandidate, event, candidatesById, memberList),
      });
    }
  }
  return {
    candidates: candidatesById,
    candidateOrder,
    shortlist: selected,
    memberRepresentation,
    representedMemberCount,
    representationPercent: memberList.length ? roundedFive((representedMemberCount / memberList.length) * 100) : 0,
    tradeoffs: tradeoffs.length === fairOnly.size ? tradeoffs : [],
  };
}

export function evaluateRescueConsensusImpact({
  members,
  original,
  replacement,
}: {
  members: ConsensusMember[];
  original: ConsensusCandidate;
  replacement: ConsensusCandidate;
}) {
  const originalConsensus = evaluateCandidate(members, original);
  const replacementConsensus = evaluateCandidate(members, replacement);
  const change = replacementConsensus.groupMatchPercent - originalConsensus.groupMatchPercent;
  const consensusSafe = Math.max(0, -change) <= 10;
  return {
    original: originalConsensus,
    replacement: replacementConsensus,
    change,
    consensusSafe,
    reason: consensusSafe
      ? "Recommended because it keeps the group's preference match close to the original plan while limiting disruption."
      : "This replacement materially reduces group match and should be reviewed before acceptance.",
  };
}
