// Core domain types for the collaborative travel planner.
// Designed to be API-ready: these shapes are what a real backend
// (Google Places, booking APIs, etc.) would eventually populate.

export const INTERESTS = [
  "Food", "Shopping", "Nature", "Culture", "History", "Adventure",
  "Photography", "Nightlife", "Relaxation", "Museums", "Architecture",
] as const;
export type Interest = (typeof INTERESTS)[number];

export const FOOD_PREFERENCES = ["Local Food", "Fine Dining", "Street Food", "Halal", "Vegetarian", "Cafe", "Dessert"] as const;
export type FoodPreference = (typeof FOOD_PREFERENCES)[number];

export const PACES = ["Relaxed", "Balanced", "Fast-paced"] as const;
export type Pace = (typeof PACES)[number];

export const TRANSPORT_MODES = ["Walking", "Public Transport", "Car", "Taxi", "Mixed"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export interface Member {
  id: string;
  name: string;
  avatarColor: string; // used to render initials avatar
  initials: string;
  isYou?: boolean;
  role?: "organizer" | "member";
  preferences?: MemberPreferences;
  suggestedPlaceIds?: string[];
  votedPlaceIds?: string[];
  hasSubmittedSuggestions?: boolean;
  hasSubmittedVotes?: boolean;
}

export interface MemberPreferences {
  interests: Interest[];
  foodPreferences: FoodPreference[];
  pace: Pace;
  mustDo: string[];
  dislikes: string[];
  personalBudget: number;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  coverColor: string;
  description?: string;
  memberIds: string[];
  organizerIds?: string[];
  tripIds: string[];
}

export type PlanningStage =
  | "ideas"
  | "preferences"
  | "voting"
  | "validation"
  | "route"
  | "itinerary";

export const STAGE_ORDER: PlanningStage[] = [
  "ideas",
  "preferences",
  "voting",
  "validation",
  "route",
  "itinerary",
];

export const STAGE_LABELS: Record<PlanningStage, string> = {
  ideas: "Ideas",
  preferences: "Preferences",
  voting: "Voting",
  validation: "Validation",
  route: "Route",
  itinerary: "Itinerary",
};

export interface PlaceOpeningHours {
  day: string;
  hours: string;
}

export interface PlaceReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}

export interface Place {
  id: string;
  source?: "catalog" | "google";
  googlePlaceId?: string;
  providerFetchedAt?: string;
  name: string;
  category: string;
  area: string; // neighborhood, used for geo-grouping
  destination: string;
  coordinates: { lat: number; lng: number };
  address: string;
  photo: string; // gradient token or image url
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  priceLabel: string;
  description: string;
  openingHours: PlaceOpeningHours[];
  /** Legacy import-time snapshot; not authoritative for current opening status. */
  isOpenNow: boolean;
  closesAt?: string;
  estimatedDurationMinutes: number;
  reviews: PlaceReview[];
  availability: "available" | "limited" | "sold_out" | "unknown";
  suggestedBy: string[]; // member ids
  voteCount: number;
  votedBy: string[]; // member ids
}

export interface RouteStop {
  placeId: string;
  arrival: string;
  travelFromPrevMinutes: number;
  travelMode: TransportMode;
}

export interface ItineraryActivity {
  id: string;
  placeId: string | null; // null for generic activities like "Lunch" / "Return"
  backupPlaceId?: string | null;
  label: string;
  time: string;
  durationMinutes: number;
  travelFromPrevMinutes: number;
  estimatedCost: number;
  locked?: boolean;
  type: "place" | "meal" | "transit" | "free";
}

export interface ItineraryDay {
  day: number;
  date: string;
  title: string; // area theme, e.g. "Asakusa & Ueno"
  activities: ItineraryActivity[];
}

export interface PressureSignal {
  label: string;
  active: boolean;
}

export interface PricePressure {
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH";
  reasons: string[];
  recommendation: string;
}

export interface TripRescueEvent {
  id: string;
  type: "weather" | "delay" | "sold_out" | "cancelled" | "overspend" | "hours_change";
  message: string;
  affectedActivityId: string;
  createdAt: string;
  status: "open" | "resolved";
  alternative?: {
    placeId: string;
    label: string;
    extraTravelMinutes: number;
    available: boolean;
    cost: number;
    note: string;
  };
}

export interface Trip {
  id: string;
  groupId: string;
  name: string;
  destinations: string[];
  coverColor: string;
  startDate: string;
  endDate: string;
  budgetTotal: number;
  groupSize: number;
  dailyStart: string;
  dailyEnd: string;
  transport: TransportMode;
  stage: PlanningStage;
  memberIds: string[];
  placeIds: string[]; // all suggested places
  shortlistPlaceIds: string[]; // after voting, selected count
  recommendedPlaceCount: number;
  votesPerMember: number;
  itinerary: ItineraryDay[];
  itineraryRevision: number;
  pricePressure: PricePressure;
  rescueEvents: TripRescueEvent[];
  isLive?: boolean; // trip mode active
}
