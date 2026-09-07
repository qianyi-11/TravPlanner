import type {
  ItineraryDay,
  ItineraryOptionScore,
  ItineraryVariant,
  NormalizedVisitWindow,
  TripDocument,
} from "@travel-planner/shared";
import type { StoredExternalSnapshot } from "../integrations/externalSnapshots";
import type { SameDayInterval } from "../validation";

export interface PlanningLocation {
  placeId?: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PlanningCandidate {
  candidateId: string;
  title: string;
  location: PlanningLocation;
  durationMinutes: number;
  mustDo: boolean;
  priorityIndex: number;
  votePreference: number;
  authoritativeVisitWindows: NormalizedVisitWindow[];
  knownPrice?: number;
}

export interface LockedPlanningBooking {
  bookingId: string;
  candidateId: string;
  title: string;
  location: PlanningLocation;
  date: string;
  startMinute: number;
  endMinute: number;
}

export interface PlannedCandidatePlacement {
  candidateId: string;
  date: string;
  startMinute: number;
  endMinute: number;
}

export interface PlanningRouteLeg {
  snapshot: StoredExternalSnapshot;
  availableMinutes: number;
}

export interface ProposedPlanningOption {
  variant: ItineraryVariant;
  days: ItineraryDay[];
  score: ItineraryOptionScore;
  candidatePlacements: PlannedCandidatePlacement[];
  routeLegs: PlanningRouteLeg[];
  routeSetComplete: boolean;
  representedCandidateIds: string[];
  unsatisfiedMustDoCandidateIds: string[];
}

export type PlanningTripContext = Pick<
  TripDocument,
  | "startDate"
  | "endDate"
  | "timezone"
  | "baseLocation"
  | "defaultDayWindow"
  | "dayOverrides"
  | "primaryTransport"
>;

export interface PlanningAuthorityFingerprintInput {
  trip: TripDocument;
  activeMemberIds: string[];
  candidateAuthority: Array<{
    candidateId: string;
    active: boolean;
    activationVersion: number;
    shortlistStatus: string;
  }>;
  confirmedBookings: Array<{
    bookingId: string;
    candidateId: string;
    date: string;
    startMinute: number;
    endMinute: number;
  }>;
}

export interface ValidatedPlanningCandidate {
  candidate: PlanningCandidate;
  baseExternalSnapshotIds: string[];
}

export interface CandidatePlacementValidationInput {
  candidateId: string;
  interval: SameDayInterval;
}
