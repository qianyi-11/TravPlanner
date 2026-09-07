import type {
  NormalizedRouteData,
  TransportMode,
  ValidationHardCheck,
} from "@travel-planner/shared";

export const TRAVEL_SAFETY_BUFFER_MINUTES: Readonly<Record<TransportMode, number>> =
  Object.freeze({
    WALKING: 10,
    DRIVING: 10,
    TRANSIT: 15,
  });

export type NormalizedRouteLegTiming = Pick<
  NormalizedRouteData,
  "transportMode" | "durationMinutes"
>;

export interface TravelLegFeasibilityResult {
  routeDurationMinutes: number;
  safetyBufferMinutes: number;
  requiredMinutes: number;
  availableMinutes: number;
  feasible: boolean;
}

export function travelSafetyBufferMinutes(mode: TransportMode): number {
  return TRAVEL_SAFETY_BUFFER_MINUTES[mode];
}

/**
 * Pure leg-level feasibility only. The caller owns route selection/fetching and
 * supplies an already-normalized route fact plus the available schedule gap.
 */
export function evaluateTravelLegFeasibility(input: {
  route: NormalizedRouteLegTiming;
  availableMinutes: number;
}): TravelLegFeasibilityResult {
  if (!Number.isInteger(input.availableMinutes) || input.availableMinutes < 0) {
    throw new RangeError("availableMinutes must be a non-negative integer");
  }
  if (!Number.isInteger(input.route.durationMinutes) || input.route.durationMinutes < 0) {
    throw new RangeError("route.durationMinutes must be a non-negative integer");
  }

  const safetyBufferMinutes = travelSafetyBufferMinutes(input.route.transportMode);
  const requiredMinutes = input.route.durationMinutes + safetyBufferMinutes;

  return {
    routeDurationMinutes: input.route.durationMinutes,
    safetyBufferMinutes,
    requiredMinutes,
    availableMinutes: input.availableMinutes,
    feasible: input.availableMinutes >= requiredMinutes,
  };
}

export function evaluateTravelTimeCheck(input: {
  route: NormalizedRouteLegTiming;
  availableMinutes: number;
}): ValidationHardCheck {
  return evaluateTravelLegFeasibility(input).feasible
    ? { check: "ROUTE_TIME", status: "PASS" }
    : {
        check: "ROUTE_TIME",
        status: "FAIL",
        reasonCode: "INSUFFICIENT_TRAVEL_TIME",
      };
}
