export interface SchedulingCriticalFactAvailability {
  hasCanonicalIdentityAndLocation: boolean;
  hasExpectedDuration: boolean;
  hasApplicableVisitWindowAuthority: boolean;
}

export function schedulingCriticalFactCompleteness(
  availability: SchedulingCriticalFactAvailability,
): "COMPLETE" | "INCOMPLETE" {
  return availability.hasCanonicalIdentityAndLocation &&
    availability.hasExpectedDuration &&
    availability.hasApplicableVisitWindowAuthority
    ? "COMPLETE"
    : "INCOMPLETE";
}
