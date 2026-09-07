export interface OptionVoteForPlurality {
  memberId: string;
  planningCycle: number;
  optionId: string;
}

export interface OptionPlurality {
  optionTotals: Record<string, number>;
  winnerOptionId?: string;
  tiedOptionIds: string[];
  isTie: boolean;
  validVoteCount: number;
}

export function calculateOptionPlurality(input: {
  votes: readonly OptionVoteForPlurality[];
  activeMemberIds: readonly string[];
  eligibleOptionIds: readonly string[];
  planningCycle: number;
}): OptionPlurality {
  const eligible = [...new Set(input.eligibleOptionIds)].sort();
  const optionTotals = Object.fromEntries(eligible.map(optionId => [optionId, 0]));
  const activeMembers = new Set(input.activeMemberIds);
  let validVoteCount = 0;
  for (const vote of input.votes) {
    if (vote.planningCycle !== input.planningCycle || !activeMembers.has(vote.memberId) || !Object.prototype.hasOwnProperty.call(optionTotals, vote.optionId)) continue;
    optionTotals[vote.optionId] += 1;
    validVoteCount += 1;
  }
  if (!validVoteCount || !eligible.length) return { optionTotals, tiedOptionIds: [], isTie: false, validVoteCount };
  const highest = Math.max(...eligible.map(optionId => optionTotals[optionId]));
  const tiedOptionIds = eligible.filter(optionId => optionTotals[optionId] === highest);
  return {
    optionTotals,
    winnerOptionId: tiedOptionIds.length === 1 && highest > 0 ? tiedOptionIds[0] : undefined,
    tiedOptionIds,
    isTie: tiedOptionIds.length > 1,
    validVoteCount,
  };
}
