import type { ItineraryVariant } from "@travel-planner/shared";
import type { PlanningCandidate } from "./types";

function distanceSquaredFromBase(candidate: PlanningCandidate, base: { lat: number; lng: number }): number {
  const dLat = candidate.location.lat - base.lat;
  const dLng = candidate.location.lng - base.lng;
  return dLat * dLat + dLng * dLng;
}

function canonical(candidates: readonly PlanningCandidate[]): PlanningCandidate[] {
  return [...candidates].sort((left, right) =>
    Number(right.mustDo) - Number(left.mustDo) ||
    left.priorityIndex - right.priorityIndex ||
    left.candidateId.localeCompare(right.candidateId),
  );
}

function travelOrdered(
  candidates: readonly PlanningCandidate[],
  base: { lat: number; lng: number },
): PlanningCandidate[] {
  return [...candidates].sort((left, right) =>
    Number(right.mustDo) - Number(left.mustDo) ||
    distanceSquaredFromBase(left, base) - distanceSquaredFromBase(right, base) ||
    left.priorityIndex - right.priorityIndex ||
    left.candidateId.localeCompare(right.candidateId),
  );
}

function interleavePriorityAndTravel(
  priority: readonly PlanningCandidate[],
  travel: readonly PlanningCandidate[],
): PlanningCandidate[] {
  const byId = new Map(priority.map(candidate => [candidate.candidateId, candidate]));
  const result: PlanningCandidate[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < Math.max(priority.length, travel.length); index += 1) {
    for (const candidate of [priority[index], travel[index]]) {
      if (!candidate || seen.has(candidate.candidateId)) continue;
      seen.add(candidate.candidateId);
      result.push(byId.get(candidate.candidateId) ?? candidate);
    }
  }
  return result;
}

export function planningVariantOrders(input: {
  candidates: readonly PlanningCandidate[];
  base: { lat: number; lng: number };
}): Array<{ variant: ItineraryVariant; candidates: PlanningCandidate[] }> {
  const priority = canonical(input.candidates);
  const travel = travelOrdered(input.candidates, input.base);
  const balanced = interleavePriorityAndTravel(priority, travel);
  return [
    { variant: "BALANCED", candidates: balanced },
    { variant: "LESS_TRAVEL", candidates: travel },
    { variant: "MORE_HIGH_PRIORITY", candidates: priority },
  ];
}
