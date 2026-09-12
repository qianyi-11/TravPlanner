import type { Place } from "./types";

const MEAL_SPEND: Record<Place["priceLevel"], readonly [number, number]> = {
  1: [5, 15],
  2: [15, 35],
  3: [35, 70],
  4: [70, 150],
};

export function estimatedMealSpend(priceLevel: Place["priceLevel"]): string {
  const [min, max] = MEAL_SPEND[priceLevel];
  return `RM ${min}–${max}`;
}

export function estimatedMealSpendRange(priceLevel: Place["priceLevel"]): readonly [number, number] {
  return MEAL_SPEND[priceLevel];
}

export function estimatedMealSpendMidpoint(priceLevel: Place["priceLevel"]): number {
  const [min, max] = estimatedMealSpendRange(priceLevel);
  return Math.round((min + max) / 2);
}
