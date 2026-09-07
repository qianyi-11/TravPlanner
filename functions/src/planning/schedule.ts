import {
  timeToMinutes,
  type ItineraryDay,
  type ItineraryItem,
  type ItineraryOptionScore,
  type ItineraryVariant,
} from "@travel-planner/shared";
import { getGoogleRouteSnapshot } from "../integrations/google/routes";
import {
  enumerateInclusiveDateStrings,
  resolveEffectiveDayWindow,
} from "../validation";
import type {
  LockedPlanningBooking,
  PlanningCandidate,
  PlanningRouteLeg,
  PlanningTripContext,
  PlannedCandidatePlacement,
  ProposedPlanningOption,
} from "./types";

type RouteResolver = typeof getGoogleRouteSnapshot;
type PlanningLocation = PlanningCandidate["location"];

interface TimelineEvent {
  itemId: string;
  candidateId: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  location: PlanningLocation;
  kind: "FIXED" | "CANDIDATE";
}

export function planningSafetyBufferMinutes(mode: PlanningTripContext["primaryTransport"]): number {
  return mode === "TRANSIT" ? 15 : 10;
}

function formatMinute(minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    throw new RangeError("Planning minute is outside a same-day boundary");
  }
  if (minute === 1440) return "23:59";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function sameLocation(left: PlanningLocation, right: PlanningLocation): boolean {
  return left.lat === right.lat && left.lng === right.lng;
}

function dayLocations(trip: PlanningTripContext, date: string) {
  const override = trip.dayOverrides.find(entry => entry.date === date);
  return {
    start: (override?.startLocation ?? trip.baseLocation) as PlanningLocation,
    end: (override?.endLocation ?? trip.baseLocation) as PlanningLocation,
  };
}

function fixedEvents(bookings: readonly LockedPlanningBooking[]): TimelineEvent[] {
  return bookings.map(booking => ({
    itemId: `fixed:${booking.bookingId}`,
    candidateId: booking.candidateId,
    title: booking.title,
    date: booking.date,
    startMinute: booking.startMinute,
    endMinute: booking.endMinute,
    location: booking.location,
    kind: "FIXED",
  }));
}

function assertFixedBookingTimeline(events: readonly TimelineEvent[]) {
  const ordered = [...events].sort((left, right) =>
    left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.date === current.date && current.startMinute < previous.endMinute) {
      throw new RangeError("Confirmed fixed bookings overlap");
    }
  }
}

async function usableRoute(input: {
  tripId: string;
  trip: PlanningTripContext;
  origin: PlanningLocation;
  destination: PlanningLocation;
  date: string;
  departureMinute: number;
  routeResolver: RouteResolver;
}) {
  if (sameLocation(input.origin, input.destination)) {
    return { durationMinutes: 0, snapshot: undefined };
  }
  const snapshot = await input.routeResolver({
    tripId: input.tripId,
    origin: input.origin,
    destination: input.destination,
    transportMode: input.trip.primaryTransport,
    departureDate: input.date,
    departureMinute: input.departureMinute,
    tripTimezone: input.trip.timezone,
  });
  if (
    snapshot.snapshot.kind !== "ROUTE" ||
    snapshot.snapshot.freshness !== "FRESH" ||
    !snapshot.snapshot.data
  ) {
    return { durationMinutes: undefined, snapshot };
  }
  return { durationMinutes: snapshot.snapshot.data.durationMinutes, snapshot };
}

async function tryInsertCandidate(input: {
  tripId: string;
  trip: PlanningTripContext;
  candidate: PlanningCandidate;
  events: TimelineEvent[];
  routeResolver: RouteResolver;
}): Promise<TimelineEvent | null> {
  const dates = enumerateInclusiveDateStrings(input.trip.startDate, input.trip.endDate);
  const buffer = planningSafetyBufferMinutes(input.trip.primaryTransport);

  for (const date of dates) {
    const dayWindow = resolveEffectiveDayWindow(date, input.trip);
    if (!dayWindow) continue;
    const locations = dayLocations(input.trip, date);
    const windows = input.candidate.authoritativeVisitWindows
      .filter(window => window.date === date)
      .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
    if (windows.length === 0) continue;

    const dayEvents = input.events
      .filter(event => event.date === date)
      .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

    for (let gapIndex = 0; gapIndex <= dayEvents.length; gapIndex += 1) {
      const previous = dayEvents[gapIndex - 1];
      const next = dayEvents[gapIndex];
      const previousEnd = previous?.endMinute ?? dayWindow.startMinute;
      const nextStart = next?.startMinute ?? dayWindow.endMinute;
      const previousLocation = previous?.location ?? locations.start;
      const nextLocation = next?.location ?? locations.end;
      if (previousEnd >= nextStart) continue;

      const inbound = await usableRoute({
        tripId: input.tripId,
        trip: input.trip,
        origin: previousLocation,
        destination: input.candidate.location,
        date,
        departureMinute: previousEnd,
        routeResolver: input.routeResolver,
      });
      if (inbound.durationMinutes === undefined) continue;
      const inboundBuffer = sameLocation(previousLocation, input.candidate.location) ? 0 : buffer;

      for (const window of windows) {
        const startMinute = Math.max(
          previousEnd + inbound.durationMinutes + inboundBuffer,
          window.startMinute,
          dayWindow.startMinute,
        );
        const endMinute = startMinute + input.candidate.durationMinutes;
        if (endMinute > window.endMinute || endMinute > dayWindow.endMinute || endMinute > nextStart) continue;

        const outbound = await usableRoute({
          tripId: input.tripId,
          trip: input.trip,
          origin: input.candidate.location,
          destination: nextLocation,
          date,
          departureMinute: endMinute,
          routeResolver: input.routeResolver,
        });
        if (outbound.durationMinutes === undefined) continue;
        const outboundBuffer = sameLocation(input.candidate.location, nextLocation) ? 0 : buffer;
        if (endMinute + outbound.durationMinutes + outboundBuffer > nextStart) continue;

        return {
          itemId: `candidate:${input.candidate.candidateId}`,
          candidateId: input.candidate.candidateId,
          title: input.candidate.title,
          date,
          startMinute,
          endMinute,
          location: input.candidate.location,
          kind: "CANDIDATE",
        };
      }
    }
  }
  return null;
}

async function finalRouteLegs(input: {
  tripId: string;
  trip: PlanningTripContext;
  events: readonly TimelineEvent[];
  routeResolver: RouteResolver;
}): Promise<{ legs: PlanningRouteLeg[]; travelMinutes: number; idleMinutes: number }> {
  const legs: PlanningRouteLeg[] = [];
  let travelMinutes = 0;
  let idleMinutes = 0;
  const buffer = planningSafetyBufferMinutes(input.trip.primaryTransport);

  for (const date of enumerateInclusiveDateStrings(input.trip.startDate, input.trip.endDate)) {
    const dayWindow = resolveEffectiveDayWindow(date, input.trip);
    if (!dayWindow) continue;
    const locations = dayLocations(input.trip, date);
    const dayEvents = input.events
      .filter(event => event.date === date)
      .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
    if (dayEvents.length === 0) continue;

    for (let index = 0; index <= dayEvents.length; index += 1) {
      const previous = dayEvents[index - 1];
      const next = dayEvents[index];
      const previousEnd = previous?.endMinute ?? dayWindow.startMinute;
      const nextStart = next?.startMinute ?? dayWindow.endMinute;
      const origin = previous?.location ?? locations.start;
      const destination = next?.location ?? locations.end;
      if (sameLocation(origin, destination)) {
        idleMinutes += Math.max(0, nextStart - previousEnd);
        continue;
      }
      const resolved = await usableRoute({
        tripId: input.tripId,
        trip: input.trip,
        origin,
        destination,
        date,
        departureMinute: previousEnd,
        routeResolver: input.routeResolver,
      });
      if (!resolved.snapshot) continue;
      const availableMinutes = Math.max(0, nextStart - previousEnd);
      legs.push({ snapshot: resolved.snapshot, availableMinutes });
      if (resolved.durationMinutes !== undefined) {
        travelMinutes += resolved.durationMinutes;
        idleMinutes += Math.max(0, availableMinutes - resolved.durationMinutes - buffer);
      }
    }
  }

  return { legs, travelMinutes, idleMinutes };
}

function toItineraryDays(trip: PlanningTripContext, events: readonly TimelineEvent[]): ItineraryDay[] {
  return enumerateInclusiveDateStrings(trip.startDate, trip.endDate).map(date => {
    const items: ItineraryItem[] = events
      .filter(event => event.date === date)
      .sort((left, right) => left.startMinute - right.startMinute || left.itemId.localeCompare(right.itemId))
      .map(event => ({
        itemId: event.itemId,
        candidateId: event.candidateId,
        title: event.title,
        date,
        startTime: formatMinute(event.startMinute),
        endTime: formatMinute(event.endMinute),
        durationMinutes: event.endMinute - event.startMinute,
        location: event.location,
      }));
    return { date, items };
  });
}

function timelineEventsFromDays(days: readonly ItineraryDay[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const day of days) {
    for (const item of day.items) {
      const startMinute = timeToMinutes(item.startTime);
      const endMinute = timeToMinutes(item.endTime);
      if (
        !item.candidateId ||
        !item.location ||
        startMinute === null ||
        endMinute === null ||
        startMinute >= endMinute ||
        endMinute - startMinute !== item.durationMinutes ||
        item.date !== day.date
      ) {
        throw new RangeError("Existing itinerary cannot be used as Planning insertion authority");
      }
      events.push({
        itemId: item.itemId,
        candidateId: item.candidateId,
        title: item.title,
        date: day.date,
        startMinute,
        endMinute,
        location: item.location,
        kind: item.itemId.startsWith("fixed:") ? "FIXED" : "CANDIDATE",
      });
    }
  }
  return events;
}

/**
 * Reuses Planning's deterministic first-feasible-slot policy for a finalized
 * itinerary Change Request. This proposes topology/timing only; Validation
 * remains authoritative for whether the resulting itinerary may commit.
 */
export async function proposeCandidateInsertion(input: {
  tripId: string;
  trip: PlanningTripContext;
  existingDays: readonly ItineraryDay[];
  candidate: PlanningCandidate;
  targetDate?: string;
  routeResolver?: RouteResolver;
}): Promise<ItineraryDay[] | null> {
  const routeResolver = input.routeResolver ?? getGoogleRouteSnapshot;
  const events = timelineEventsFromDays(input.existingDays);
  if (events.some(event => event.candidateId === input.candidate.candidateId)) {
    return null;
  }
  const candidate = input.targetDate === undefined
    ? input.candidate
    : {
        ...input.candidate,
        authoritativeVisitWindows: input.candidate.authoritativeVisitWindows.filter(
          window => window.date === input.targetDate,
        ),
      };
  const placement = await tryInsertCandidate({
    tripId: input.tripId,
    trip: input.trip,
    candidate,
    events,
    routeResolver,
  });
  if (!placement) return null;
  events.push(placement);
  return toItineraryDays(input.trip, events);
}

function optionScore(input: {
  represented: ReadonlySet<string>;
  candidates: readonly PlanningCandidate[];
  travelMinutes: number;
  idleMinutes: number;
}): ItineraryOptionScore {
  const representedCandidates = input.candidates.filter(candidate => input.represented.has(candidate.candidateId));
  return {
    mustDo: representedCandidates.filter(candidate => candidate.mustDo).length,
    votePreference: representedCandidates.reduce((sum, candidate) => sum + candidate.votePreference, 0),
    travelEfficiency: -input.travelMinutes,
    gapEfficiency: -input.idleMinutes,
    budgetEfficiency: -representedCandidates.reduce((sum, candidate) => sum + (candidate.knownPrice ?? 0), 0),
    preferredPeriod: 0,
  };
}

export async function proposePlanningOption(input: {
  tripId: string;
  trip: PlanningTripContext;
  variant: ItineraryVariant;
  orderedCandidates: readonly PlanningCandidate[];
  allShortlistedCandidates: readonly PlanningCandidate[];
  fixedBookings: readonly LockedPlanningBooking[];
  routeResolver?: RouteResolver;
}): Promise<ProposedPlanningOption> {
  const routeResolver = input.routeResolver ?? getGoogleRouteSnapshot;
  const events = fixedEvents(input.fixedBookings);
  assertFixedBookingTimeline(events);
  const fixedCandidateIds = new Set(input.fixedBookings.map(booking => booking.candidateId));
  const placements: PlannedCandidatePlacement[] = [];
  const unsatisfiedMustDoCandidateIds: string[] = [];

  for (const candidate of input.orderedCandidates) {
    if (fixedCandidateIds.has(candidate.candidateId)) continue;
    const placement = await tryInsertCandidate({
      tripId: input.tripId,
      trip: input.trip,
      candidate,
      events,
      routeResolver,
    });
    if (!placement) {
      if (candidate.mustDo) unsatisfiedMustDoCandidateIds.push(candidate.candidateId);
      continue;
    }
    events.push(placement);
    placements.push({
      candidateId: placement.candidateId,
      date: placement.date,
      startMinute: placement.startMinute,
      endMinute: placement.endMinute,
    });
  }

  const route = await finalRouteLegs({
    tripId: input.tripId,
    trip: input.trip,
    events,
    routeResolver,
  });
  const represented = new Set([
    ...fixedCandidateIds,
    ...placements.map(placement => placement.candidateId),
  ]);
  const shortlistedSet = new Set(input.allShortlistedCandidates.map(candidate => candidate.candidateId));
  const representedCandidateIds = [...represented].filter(candidateId => shortlistedSet.has(candidateId)).sort();

  return {
    variant: input.variant,
    days: toItineraryDays(input.trip, events),
    score: optionScore({
      represented,
      candidates: input.allShortlistedCandidates,
      travelMinutes: route.travelMinutes,
      idleMinutes: route.idleMinutes,
    }),
    candidatePlacements: placements,
    routeLegs: route.legs,
    routeSetComplete: true,
    representedCandidateIds,
    unsatisfiedMustDoCandidateIds: [...new Set(unsatisfiedMustDoCandidateIds)].sort(),
  };
}

export function itineraryDaysIdentity(days: readonly ItineraryDay[]): string {
  return JSON.stringify(days.map(day => ({
    date: day.date,
    items: day.items.map(item => ({
      itemId: item.itemId,
      candidateId: item.candidateId,
      startTime: item.startTime,
      endTime: item.endTime,
    })),
  })));
}

export function itineraryItemInterval(item: ItineraryItem): { date: string; startMinute: number; endMinute: number } {
  const startMinute = timeToMinutes(item.startTime);
  const endMinute = timeToMinutes(item.endTime);
  if (startMinute === null || endMinute === null || startMinute >= endMinute) {
    throw new RangeError("Itinerary item timing is invalid");
  }
  return { date: item.date, startMinute, endMinute };
}
