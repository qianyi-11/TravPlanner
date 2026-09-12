import type { Place } from "./types";

const MEAL_SPEND: Record<Place["priceLevel"], string> = {
  1: "RM 5–15",
  2: "RM 15–35",
  3: "RM 35–70",
  4: "RM 70–150",
};

export function estimatedMealSpend(priceLevel: Place["priceLevel"]): string {
  return MEAL_SPEND[priceLevel];
}
