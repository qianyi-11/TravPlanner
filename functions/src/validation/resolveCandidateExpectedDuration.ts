import type { SubmissionDocument } from "@travel-planner/shared";
import { timestampMillis } from "./criticalFactScope";

export interface ConfirmedDurationFact {
  durationMinutes: number;
  confirmedAt: unknown;
  externalSnapshotId: string;
}

export type CandidateExpectedDurationResolution =
  | {
      kind: "USER_CONFIRMED";
      durationMinutes: number;
      externalSnapshotId: string;
    }
  | {
      kind: "SUBMISSION_MEDIAN";
      durationMinutes: number;
    }
  | { kind: "MISSING" };

export function resolveCandidateExpectedDuration(input: {
  confirmedDurationFacts: readonly ConfirmedDurationFact[];
  submissions: readonly SubmissionDocument[];
  activeMemberIds: ReadonlySet<string> | readonly string[];
}): CandidateExpectedDurationResolution {
  const confirmed = [...input.confirmedDurationFacts]
    .sort((left, right) => {
      const byTime = timestampMillis(right.confirmedAt) - timestampMillis(left.confirmedAt);
      return byTime !== 0
        ? byTime
        : right.externalSnapshotId.localeCompare(left.externalSnapshotId);
    })[0];

  if (confirmed) {
    if (!Number.isInteger(confirmed.durationMinutes) || confirmed.durationMinutes <= 0) {
      throw new RangeError("Confirmed duration must be a positive integer");
    }
    return {
      kind: "USER_CONFIRMED",
      durationMinutes: confirmed.durationMinutes,
      externalSnapshotId: confirmed.externalSnapshotId,
    };
  }

  const activeMemberIds = input.activeMemberIds instanceof Set
    ? input.activeMemberIds
    : new Set(input.activeMemberIds);
  const durations = input.submissions
    .filter(submission => activeMemberIds.has(submission.memberId))
    .map(submission => submission.estimatedDurationMinutes)
    .sort((left, right) => left - right);

  if (durations.length === 0) return { kind: "MISSING" };

  const middle = Math.floor(durations.length / 2);
  const durationMinutes = durations.length % 2 === 1
    ? durations[middle]
    : Math.ceil((durations[middle - 1] + durations[middle]) / 2);

  return { kind: "SUBMISSION_MEDIAN", durationMinutes };
}
