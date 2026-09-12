import type { Place } from "./types";

const FOOD_PATTERN = /\b(food market|bar & grill|hot ?pot|ice cream|restaurant|cafe|café|bakery|ramen|noodle|dessert|coffee|tea|bistro|diner|eatery|kitchen|grill|sushi|pizza|burger|buffet|bagel|brunch|deli|steakhouse|seafood|meal)\b/i;
const NON_FOOD_PATTERN = /\b(supply|appliance|equipment)\b/i;

export function isFoodPlace(place: Pick<Place, "category">): boolean {
  return !NON_FOOD_PATTERN.test(place.category) && FOOD_PATTERN.test(place.category);
}
