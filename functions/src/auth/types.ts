import type {
  TripDocument,
  TripMemberDocument,
  TripPhase,
} from "@travel-planner/shared";

export interface TripAuthContext {
  uid: string;
  tripId: string;
  trip: TripDocument;
  member: TripMemberDocument | null;
}

export type AllowedTripPhases = readonly TripPhase[];
