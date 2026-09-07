export const TRANSPORT_MODES = ["WALKING", "DRIVING", "TRANSIT"] as const;
export const TRIP_PHASES = ["COLLECTING", "VOTING", "PLANNING", "REVIEW", "FINALIZED"] as const;
export const MEMBER_ROLES = ["OWNER", "MEMBER"] as const;
export const MEMBER_STATUSES = ["ACTIVE", "REMOVED"] as const;
export const CANDIDATE_VOTE_VALUES = ["WANT", "NEUTRAL", "AVOID"] as const;
export const SUBMISSION_PREFERENCES = ["INTERESTED", "MUST_DO"] as const;
export const PREFERRED_PERIODS = ["ANYTIME", "MORNING", "AFTERNOON", "EVENING"] as const;
export const DURATION_SOURCES = ["SYSTEM", "USER_OVERRIDE"] as const;
export const SHORTLIST_STATUSES = ["PENDING", "SHORTLISTED", "NOT_SHORTLISTED"] as const;
export const ITINERARY_VARIANTS = ["BALANCED", "LESS_TRAVEL", "MORE_HIGH_PRIORITY"] as const;
export const VALIDATION_RESULTS = ["VALID", "INVALID", "NEEDS_CONFIRMATION"] as const;
export const VALIDATION_SCOPES = [
  "CANDIDATE",
  "ITINERARY_OPTION",
  "REVIEW_DRAFT",
  "ITINERARY_VERSION",
  "CHANGE_REQUEST",
  "BACKUP",
] as const;
export const VALIDATION_CHECK_STATUSES = [
  "PASS",
  "FAIL",
  "NEEDS_CONFIRMATION",
  "NOT_APPLICABLE",
] as const;
export const VALIDATION_CHECKS = [
  "PLACE_IDENTITY",
  "LOCATION",
  "DURATION",
  "VISIT_WINDOW",
  "TRIP_DATE",
  "DAY_WINDOW",
  "FIXED_BOOKING",
  "ROUTE_TIME",
  "OVERLAP",
  "ACTIVITY_BUDGET",
  "PRICE",
] as const;
export const VALIDATION_REASON_CODES = [
  "INVALID_PLACE_IDENTITY",
  "MISSING_LOCATION",
  "MISSING_DURATION",
  "MISSING_VISIT_WINDOW",
  "INVALID_VISIT_WINDOW",
  "OUTSIDE_TRIP_DATE",
  "OUTSIDE_DAY_WINDOW",
  "FIXED_BOOKING_CONFLICT",
  "ROUTE_UNAVAILABLE",
  "INSUFFICIENT_TRAVEL_TIME",
  "SCHEDULE_OVERLAP",
  "ACTIVITY_BUDGET_EXCEEDED",
  "PRICE_UNKNOWN",
  "EXTERNAL_DATA_STALE",
  "EXTERNAL_DATA_UNAVAILABLE",
] as const;
export const FRESHNESS_STATUSES = ["FRESH", "STALE", "UNAVAILABLE"] as const;
export const COST_STATUSES = ["CONFIRMED", "ESTIMATED", "UNKNOWN"] as const;
export const ENVIRONMENT_TYPES = ["INDOOR", "OUTDOOR", "MIXED", "UNKNOWN"] as const;
export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "STALE"] as const;
export const CHANGE_REQUEST_STATUSES = ["PENDING", "APPROVED", "APPLIED", "REJECTED", "NEEDS_REVALIDATION"] as const;
export const MEMBERSHIP_IMPACT_REASON_CODES = [
  "GROUP_BECAME_SOLO",
  "CANDIDATE_SUPPORT_CHANGED",
  "MUST_DO_SET_CHANGED",
  "CANDIDATE_RANKING_CHANGED",
  "SHORTLIST_CHANGED",
  "OPTION_OUTCOME_CHANGED",
  "BUDGET_DEPENDENCY_CHANGED",
  "APPROVAL_STATE_CHANGED",
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export type TripPhase = (typeof TRIP_PHASES)[number];
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export type CandidateVoteValue = (typeof CANDIDATE_VOTE_VALUES)[number];
export type SubmissionPreference = (typeof SUBMISSION_PREFERENCES)[number];
export type PreferredPeriod = (typeof PREFERRED_PERIODS)[number];
export type ShortlistStatus = (typeof SHORTLIST_STATUSES)[number];
export type ItineraryVariant = (typeof ITINERARY_VARIANTS)[number];
export type ValidationResult = (typeof VALIDATION_RESULTS)[number];
export type ValidationScope = (typeof VALIDATION_SCOPES)[number];
export type ValidationCheckStatus = (typeof VALIDATION_CHECK_STATUSES)[number];
export type ValidationCheck = (typeof VALIDATION_CHECKS)[number];
export type ValidationReasonCode = (typeof VALIDATION_REASON_CODES)[number];
export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];
export type CostStatus = (typeof COST_STATUSES)[number];
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];
export type MembershipImpactReasonCode = (typeof MEMBERSHIP_IMPACT_REASON_CODES)[number];
