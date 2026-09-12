import type { PlanningStage, Trip } from "./types";
import { STAGE_ORDER } from "./types";

export function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function formatDateFull(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatDateRange(startIso: string, endIso: string): string {
  const [ys] = startIso.split("-").map(Number);
  const [ye] = endIso.split("-").map(Number);
  const start = formatDate(startIso);
  const end = formatDate(endIso) + (ye !== ys ? ` '${String(ye).slice(2)}` : "");
  return `${start} — ${end}`;
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

export function formatWeekday(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatCurrency(amount: number, currency = "RM"): string {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function stageIndex(stage: PlanningStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function stageStatus(
  stage: PlanningStage,
  current: PlanningStage
): "done" | "current" | "upcoming" {
  const a = stageIndex(stage);
  const b = stageIndex(current);
  if (a < b) return "done";
  if (a === b) return "current";
  return "upcoming";
}

export function recommendPlaceCount(trip: Pick<Trip, "startDate" | "endDate" | "dailyStart" | "dailyEnd">): {
  count: number;
  reasoning: string;
} {
  const days = daysBetween(trip.startDate, trip.endDate);
  const [sh] = trip.dailyStart.split(":").map(Number);
  const [eh] = trip.dailyEnd.split(":").map(Number);
  const hoursPerDay = Math.max(4, eh - sh);
  const perDay = hoursPerDay >= 12 ? 2.2 : hoursPerDay >= 9 ? 1.8 : 1.4;
  const count = Math.max(4, Math.round(days * perDay));
  return {
    count,
    reasoning: `Based on your ${days}-day trip and ${hoursPerDay}-hour daily window, we recommend around ${count} major activities — enough to fill your days without rushing between them.`,
  };
}

export function pressureTone(level: "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH") {
  switch (level) {
    case "LOW":
      return { bg: "var(--color-success-bg)", fg: "var(--color-success)", ring: "var(--color-success)" };
    case "MEDIUM":
      return { bg: "var(--color-warning-bg)", fg: "var(--color-warning)", ring: "var(--color-warning)" };
    case "HIGH":
      return { bg: "var(--color-orange-bg)", fg: "var(--color-orange)", ring: "var(--color-orange)" };
    case "VERY HIGH":
      return { bg: "var(--color-danger-bg)", fg: "var(--color-danger)", ring: "var(--color-danger)" };
  }
}

export function initialsAvatarStyle(color: string) {
  return { backgroundColor: color };
}

// Category strings (ours, and Google's snake_case types title-cased on import)
// that mean "you eat here" rather than "you go look at it".
const FOOD_KEYWORDS = [
  "food", "restaurant", "cafe", "café", "bakery", "ramen", "noodle", "dessert",
  "coffee", "tea", "bistro", "diner", "eatery", "kitchen", "grill", "sushi",
  "pizza", "burger", "buffet", "hot pot", "hotpot", "ice cream", "bagel",
  "brunch", "deli", "steakhouse", "seafood", "bar & grill", "meal",
];

export function isFoodPlace(place: { category: string }): boolean {
  const c = place.category.toLowerCase();
  return FOOD_KEYWORDS.some((kw) => c.includes(kw));
}

/**
 * A per-person spend estimate for eating somewhere, derived from Google's
 * price level. Deliberately a range, not a single figure — it's an estimate
 * for budgeting, not a quoted price.
 */
export function estimatedMealCost(priceLevel: 1 | 2 | 3 | 4): {
  low: number;
  high: number;
  label: string;
} {
  const ranges: Record<1 | 2 | 3 | 4, [number, number]> = {
    1: [5, 15],
    2: [15, 35],
    3: [35, 70],
    4: [70, 150],
  };
  const [low, high] = ranges[priceLevel] ?? ranges[2];
  return { low, high, label: `RM ${low} – ${high}` };
}

// How long people actually spend somewhere, by category — used whenever a
// place doesn't come with its own curated duration (chiefly, anything
// imported live from Google, which has no "typical visit length" of its own).
// A shopping mall and a cafe are not the same time commitment; treating them
// as if they were is exactly how a day ends up over-packed.
const DURATION_BY_KEYWORD: [RegExp, number][] = [
  [/theme park|amusement/, 360],
  [/museum|gallery|art/, 120],
  [/mall|shopping (mall|centre|center)/, 120],
  [/zoo|aquarium|water ?park/, 180],
  [/market/, 75],
  [/temple|shrine|mosque|church|cathedral/, 75],
  [/park|garden|nature|reserve/, 90],
  [/historic|heritage|old town/, 90],
  [/castle|palace|fort/, 90],
  [/beach/, 120],
  [/observation|tower|viewpoint|lookout/, 60],
  [/landmark|monument|square|plaza/, 45],
  [/bakery|dessert|ice cream|cafe|café|coffee/, 45],
  [/bar|pub|lounge|nightlife|club/, 90],
  [/ramen|fast food|street food|hawker/, 45],
  [/restaurant|food|dining|kitchen|grill|bistro/, 60],
];

export function estimateVisitDuration(category: string): number {
  const c = category.toLowerCase();
  for (const [pattern, minutes] of DURATION_BY_KEYWORD) {
    if (pattern.test(c)) return minutes;
  }
  return 75; // a generic "look around" default for anything unrecognized
}

export function totalItineraryCost(trip: Trip): number {
  return trip.itinerary.reduce(
    (sum, day) => sum + day.activities.reduce((s, a) => s + a.estimatedCost, 0),
    0
  );
}

export interface BudgetBreakdown {
  transport: number;
  food: number;
  activities: number;
  accommodation: number;
  total: number;
  perPerson: number;
}

export function computeBudgetBreakdown(trip: Trip): BudgetBreakdown {
  let transport = 0;
  let food = 0;
  let activities = 0;
  for (const day of trip.itinerary) {
    for (const a of day.activities) {
      if (a.type === "transit") transport += a.estimatedCost;
      else if (a.type === "meal") food += a.estimatedCost;
      else activities += a.estimatedCost;
    }
  }
  const accommodation = Math.round(trip.budgetTotal * 0.35);
  const total = transport + food + activities + accommodation;
  const perPerson = Math.round(total / Math.max(1, trip.memberIds.length));
  return { transport, food, activities, accommodation, total, perPerson };
}
