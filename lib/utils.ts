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
