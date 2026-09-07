import { getFirestore, type Transaction } from "firebase-admin/firestore";
import {
  candidateDocumentSchema,
  legacyCandidateVoteReadSchema,
  submissionDocumentSchema,
  timeToMinutes,
  type CandidateDocument,
  type LegacyCandidateVoteDocument,
  type SubmissionDocument,
  type TripDocument,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireMembershipVersion,
  requireOwner,
  requirePhase,
  requirePlanningCycle,
} from "../auth";
import { parsePersistedFixedBookingOrThrow } from "../bookings/parsePersistedBooking";
import { candidateIdFromPlaceId, submissionIdForCandidate } from "../candidates/candidateIdentity";
import { loadLatestExternalSnapshotByCacheKeyInTransaction } from "../integrations/latestExternalSnapshot";
import { PLACE_DETAILS_TTL_MS } from "../integrations/google/placeDetails";
import { isCandidateVoteIdentity } from "../voting/candidateVoteIdentity";
import { aggregateCandidateVotes, type CandidateVoteAggregate } from "../voting/candidateVoteAggregation";
import {
  buildCriticalFactScopeKey,
  buildPlaceDetailsCacheKey,
  enumerateInclusiveDateStrings,
  timestampMillis,
} from "../validation/criticalFactScope";
import {
  resolveCandidateExpectedDuration,
  type CandidateExpectedDurationResolution,
  type ConfirmedDurationFact,
} from "../validation/resolveCandidateExpectedDuration";
import { calculateShortlist, shortlistStatusPatches } from "./calculateShortlist";
import { calculateTotalUsableMinutes, type ConfirmedBookingOccupancy } from "./capacity";
import { schedulingCriticalFactCompleteness } from "./factCompleteness";
import { resolveRepresentativeTravel, type RouteSnapshotResolver } from "./representativeTravel";
import type { ShortlistCalculationResult, ShortlistCandidateInput } from "./types";

interface AuthoritativeCandidate {
  document: CandidateDocument;
  candidateId: string;
  submissions: SubmissionDocument[];
  mustDo: boolean;
  expectedDuration: CandidateExpectedDurationResolution;
  voteAggregate?: CandidateVoteAggregate;
  factCompleteness?: "COMPLETE" | "INCOMPLETE";
}

interface Preflight {
  trip: TripDocument;
  mode: "GROUP" | "SOLO";
  membershipVersion: number;
  activeMemberIds: string[];
  candidates: AuthoritativeCandidate[];
  confirmedBookings: ConfirmedBookingOccupancy[];
  totalUsableMinutes: number;
  fingerprint: string;
}

export interface AuthoritativeShortlistResult extends ShortlistCalculationResult {
  mode: "GROUP" | "SOLO";
  planningCycle: number;
  membershipVersion: number;
  representativeRouteSnapshotIds: string[];
}

function parseCandidate(data: unknown, candidateId: string, tripId: string): CandidateDocument {
  const parsed = candidateDocumentSchema.safeParse(data);
  if (!parsed.success || candidateIdFromPlaceId(parsed.success ? parsed.data.placeId : "") !== candidateId) {
    throw authError("CONFLICT", "Candidate state is invalid.", { tripId, targetId: candidateId });
  }
  return parsed.data;
}

function parseSubmission(data: unknown, submissionId: string, tripId: string): SubmissionDocument {
  const parsed = submissionDocumentSchema.safeParse(data);
  if (!parsed.success || submissionIdForCandidate(parsed.success ? parsed.data.memberId : "", parsed.success ? parsed.data.candidateId : "") !== submissionId) {
    throw authError("CONFLICT", "Submission state is invalid.", { tripId, targetId: submissionId });
  }
  return parsed.data;
}

function parseVote(data: unknown, voteId: string, tripId: string): LegacyCandidateVoteDocument {
  const parsed = legacyCandidateVoteReadSchema.safeParse(data);
  if (!parsed.success || !isCandidateVoteIdentity(voteId, parsed.success ? parsed.data : { planningCycle: 0, candidateId: "", memberId: "" })) {
    throw authError("CONFLICT", "Candidate vote state is invalid.", { tripId, targetId: voteId });
  }
  return parsed.data;
}

function confirmedDurationFact(entry: Awaited<ReturnType<typeof loadLatestExternalSnapshotByCacheKeyInTransaction>>): ConfirmedDurationFact[] {
  if (!entry || entry.snapshot.kind !== "CRITICAL_FACT" || entry.snapshot.provider !== "USER_CONFIRMED" || entry.snapshot.freshness !== "FRESH") return [];
  if (entry.snapshot.data.type !== "DURATION") return [];
  return [{
    durationMinutes: entry.snapshot.data.durationMinutes,
    confirmedAt: entry.snapshot.confirmedAt,
    externalSnapshotId: entry.id,
  }];
}

function hasFreshPlaceVisitWindow(entry: Awaited<ReturnType<typeof loadLatestExternalSnapshotByCacheKeyInTransaction>>, nowMs: number): boolean {
  if (!entry || entry.snapshot.kind !== "PLACE_DETAILS" || entry.snapshot.provider !== "GOOGLE_PLACES" || entry.snapshot.freshness !== "FRESH" || !entry.snapshot.data) return false;
  return nowMs - timestampMillis(entry.snapshot.fetchedAt) <= PLACE_DETAILS_TTL_MS && entry.snapshot.data.visitWindows.length > 0;
}

function hasConfirmedVisitWindow(entry: Awaited<ReturnType<typeof loadLatestExternalSnapshotByCacheKeyInTransaction>>): boolean {
  return Boolean(entry && entry.snapshot.kind === "CRITICAL_FACT" && entry.snapshot.provider === "USER_CONFIRMED" && entry.snapshot.freshness === "FRESH" && entry.snapshot.data.type === "VISIT_WINDOW");
}

function stableFingerprint(input: Omit<Preflight, "fingerprint">): string {
  return JSON.stringify({
    trip: {
      phase: input.trip.phase,
      planningCycle: input.trip.planningCycle,
      membershipVersion: input.trip.membershipVersion,
      votingBasisMembershipVersion: input.trip.votingBasisMembershipVersion,
      ownerId: input.trip.ownerId,
      startDate: input.trip.startDate,
      endDate: input.trip.endDate,
      timezone: input.trip.timezone,
      baseLocation: input.trip.baseLocation,
      defaultDayWindow: input.trip.defaultDayWindow,
      dayOverrides: input.trip.dayOverrides,
      primaryTransport: input.trip.primaryTransport,
    },
    mode: input.mode,
    activeMemberIds: [...input.activeMemberIds].sort(),
    candidates: input.candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      placeId: candidate.document.placeId,
      location: candidate.document.location,
      active: candidate.document.active,
      activationVersion: candidate.document.activationVersion,
      shortlistStatus: candidate.document.shortlistStatus,
      submissions: candidate.submissions.map(submission => ({
        memberId: submission.memberId,
        preference: submission.preference,
        estimatedDurationMinutes: submission.estimatedDurationMinutes,
        durationSource: submission.durationSource,
      })).sort((a, b) => a.memberId.localeCompare(b.memberId)),
      mustDo: candidate.mustDo,
      expectedDuration: candidate.expectedDuration,
      voteAggregate: candidate.voteAggregate,
      factCompleteness: candidate.factCompleteness,
    })).sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    confirmedBookings: [...input.confirmedBookings].sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.endMinute - b.endMinute),
    totalUsableMinutes: input.totalUsableMinutes,
  });
}

async function readPreflight(input: {
  transaction: Transaction;
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
  expectedMembershipVersion?: number;
  nowMs: number;
}): Promise<Preflight> {
  const context = await loadTripAuthContextInTransaction(input.transaction, input.tripId, input.ownerId);
  requireOwner(context);
  requirePhase(context, ["PLANNING"]);
  requirePlanningCycle(context, input.expectedPlanningCycle);
  if (input.expectedMembershipVersion !== undefined) requireMembershipVersion(context, input.expectedMembershipVersion);

  const membership = await loadAuthoritativeMembershipState(input.transaction, input.tripId);
  if (!membership.activeOwnerId || membership.activeOwnerId !== context.trip.ownerId || membership.activeOwnerId !== input.ownerId) {
    throw authError("CONFLICT", "Trip membership authority is inconsistent.", { tripId: input.tripId });
  }
  const mode: Preflight["mode"] = membership.isSolo ? "SOLO" : "GROUP";
  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const [candidateSnapshots, submissionSnapshots, bookingSnapshots] = await Promise.all([
    input.transaction.get(tripRef.collection("candidates").where("active", "==", true)),
    input.transaction.get(tripRef.collection("submissions")),
    input.transaction.get(tripRef.collection("fixedBookings").where("status", "==", "CONFIRMED")),
  ]);
  if (candidateSnapshots.empty) throw authError("NO_ACTIVE_CANDIDATES", "At least one active candidate is required.", { tripId: input.tripId });

  const candidates = candidateSnapshots.docs.map(snapshot => ({ candidateId: snapshot.id, document: parseCandidate(snapshot.data(), snapshot.id, input.tripId) }));
  const candidateIds = new Set(candidates.map(candidate => candidate.candidateId));
  const activeMemberIds = new Set(membership.activeMemberIds);
  const submissions = submissionSnapshots.docs
    .map(snapshot => parseSubmission(snapshot.data(), snapshot.id, input.tripId))
    .filter(submission => activeMemberIds.has(submission.memberId) && candidateIds.has(submission.candidateId));

  let aggregates: Record<string, CandidateVoteAggregate> = {};
  if (mode === "GROUP") {
    const voteSnapshots = await input.transaction.get(
      tripRef.collection("candidateVotes").where("planningCycle", "==", context.trip.planningCycle),
    );
    const votes = voteSnapshots.docs.map(snapshot => parseVote(snapshot.data(), snapshot.id, input.tripId));
    aggregates = aggregateCandidateVotes({
      votes,
      activeMemberIds: membership.activeMemberIds,
      planningCycle: context.trip.planningCycle,
      candidates: candidates.map(candidate => ({
        candidateId: candidate.candidateId,
        active: candidate.document.active,
        activationVersion: candidate.document.activationVersion,
      })),
    });
  }

  const dates = enumerateInclusiveDateStrings(context.trip.startDate, context.trip.endDate);
  const authoritativeCandidates: AuthoritativeCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const candidateSubmissions = submissions.filter(submission => submission.candidateId === candidate.candidateId);
    const durationKey = buildCriticalFactScopeKey({
      candidateId: candidate.candidateId,
      timezone: context.trip.timezone,
      fact: { type: "DURATION", durationMinutes: 1 },
    });
    const durationSnapshot = await loadLatestExternalSnapshotByCacheKeyInTransaction(input.transaction, input.tripId, durationKey);
    const expectedDuration = resolveCandidateExpectedDuration({
      confirmedDurationFacts: confirmedDurationFact(durationSnapshot),
      submissions: candidateSubmissions,
      activeMemberIds,
    });
    const mustDo = candidateSubmissions.some(submission => submission.preference === "MUST_DO");

    let factCompleteness: "COMPLETE" | "INCOMPLETE" | undefined;
    if (mode === "SOLO") {
      const ownerSubmission = candidateSubmissions.find(submission => submission.memberId === input.ownerId);
      if (!ownerSubmission) {
        throw authError("CONFLICT", "Solo candidate lacks current OWNER submission authority.", { tripId: input.tripId, targetId: candidate.candidateId });
      }
      const visitSnapshots = await Promise.all(dates.map(date => loadLatestExternalSnapshotByCacheKeyInTransaction(
        input.transaction,
        input.tripId,
        buildCriticalFactScopeKey({
          candidateId: candidate.candidateId,
          timezone: context.trip.timezone,
          fact: { type: "VISIT_WINDOW", date, startTime: "00:00", endTime: "00:01" },
        }),
      )));
      const placeSnapshot = await loadLatestExternalSnapshotByCacheKeyInTransaction(
        input.transaction,
        input.tripId,
        buildPlaceDetailsCacheKey({
          placeId: candidate.document.placeId,
          timezone: context.trip.timezone,
          startDate: context.trip.startDate,
          endDate: context.trip.endDate,
        }),
      );
      factCompleteness = schedulingCriticalFactCompleteness({
        hasCanonicalIdentityAndLocation: true,
        hasExpectedDuration: expectedDuration.kind !== "MISSING",
        hasApplicableVisitWindowAuthority: visitSnapshots.some(hasConfirmedVisitWindow) || hasFreshPlaceVisitWindow(placeSnapshot, input.nowMs),
      });
    }

    authoritativeCandidates.push({
      ...candidate,
      submissions: candidateSubmissions,
      mustDo,
      expectedDuration,
      ...(mode === "GROUP" ? { voteAggregate: aggregates[candidate.candidateId] ?? { scoreTotal: 0, responseCount: 0, wantCount: 0, neutralCount: 0, avoidCount: 0 } } : {}),
      ...(factCompleteness === undefined ? {} : { factCompleteness }),
    });
  }

  const confirmedBookings: ConfirmedBookingOccupancy[] = bookingSnapshots.docs.map(snapshot => {
    const parsed = parsePersistedFixedBookingOrThrow(snapshot.data(), snapshot.id, input.tripId);
    const startMinute = timeToMinutes(parsed.normalizedTiming.startTime);
    const endMinute = timeToMinutes(parsed.normalizedTiming.endTime);
    if (startMinute === null || endMinute === null) throw authError("CONFLICT", "Fixed booking timing is invalid.", { tripId: input.tripId, targetId: snapshot.id });
    return { date: parsed.booking.date, startMinute, endMinute };
  });
  const totalUsableMinutes = calculateTotalUsableMinutes({ setup: context.trip, confirmedBookings });
  const withoutFingerprint: Omit<Preflight, "fingerprint"> = {
    trip: context.trip,
    mode,
    membershipVersion: context.trip.membershipVersion,
    activeMemberIds: [...membership.activeMemberIds].sort(),
    candidates: authoritativeCandidates,
    confirmedBookings,
    totalUsableMinutes,
  };
  return { ...withoutFingerprint, fingerprint: stableFingerprint(withoutFingerprint) };
}

async function resolveTravelForCandidates(input: {
  tripId: string;
  preflight: Preflight;
  routeResolver?: RouteSnapshotResolver;
}): Promise<{ candidates: ShortlistCandidateInput[]; snapshotIds: string[] }> {
  const result: ShortlistCandidateInput[] = new Array(input.preflight.candidates.length);
  const snapshotIds: string[] = [];
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      const candidate = input.preflight.candidates[index];
      if (!candidate) return;
      const travel = await resolveRepresentativeTravel({
        tripId: input.tripId,
        trip: input.preflight.trip,
        candidateLocation: candidate.document.location,
        routeResolver: input.routeResolver,
      });
      snapshotIds.push(...travel.externalSnapshotIds);
      result[index] = {
        candidateId: candidate.candidateId,
        mustDo: candidate.mustDo,
        ...(candidate.expectedDuration.kind === "MISSING" ? {} : { expectedDurationMinutes: candidate.expectedDuration.durationMinutes }),
        ...(travel.representativeTravelMinutes === undefined ? {} : { representativeTravelMinutes: travel.representativeTravelMinutes }),
        ...(candidate.voteAggregate === undefined ? {} : { voteAggregate: candidate.voteAggregate }),
        ...(candidate.factCompleteness === undefined ? {} : { factCompleteness: candidate.factCompleteness }),
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, input.preflight.candidates.length) }, () => worker()));
  return { candidates: result, snapshotIds: [...new Set(snapshotIds)].sort() };
}

export async function runAuthoritativeShortlist(input: {
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
  routeResolver?: RouteSnapshotResolver;
  nowMs?: number;
}): Promise<AuthoritativeShortlistResult> {
  const nowMs = input.nowMs ?? Date.now();
  const db = getFirestore();
  const initial = await db.runTransaction(transaction => readPreflight({
    transaction,
    tripId: input.tripId,
    ownerId: input.ownerId,
    expectedPlanningCycle: input.expectedPlanningCycle,
    nowMs,
  }));

  const travel = await resolveTravelForCandidates({ tripId: input.tripId, preflight: initial, routeResolver: input.routeResolver });
  let calculation: ShortlistCalculationResult;
  try {
    calculation = calculateShortlist({ mode: initial.mode, candidates: travel.candidates, totalUsableMinutes: initial.totalUsableMinutes });
  } catch (error) {
    if (error instanceof RangeError) {
      throw authError("CONFLICT", "Authoritative shortlist capacity is indeterminate.", { tripId: input.tripId, detail: error.message });
    }
    throw error;
  }
  const patches = shortlistStatusPatches(calculation);

  await db.runTransaction(async transaction => {
    const current = await readPreflight({
      transaction,
      tripId: input.tripId,
      ownerId: input.ownerId,
      expectedPlanningCycle: input.expectedPlanningCycle,
      expectedMembershipVersion: initial.membershipVersion,
      nowMs,
    });
    if (current.fingerprint !== initial.fingerprint) {
      throw authError("CONFLICT", "Shortlist authority changed while provider data was being resolved.", { tripId: input.tripId });
    }
    const byId = new Map(current.candidates.map(candidate => [candidate.candidateId, candidate]));
    const tripRef = db.collection("trips").doc(input.tripId);
    for (const patch of patches) {
      const candidate = byId.get(patch.candidateId);
      if (!candidate) throw authError("CONFLICT", "Shortlist candidate authority changed.", { tripId: input.tripId, targetId: patch.candidateId });
      if (candidate.document.shortlistStatus !== patch.shortlistStatus) {
        transaction.update(tripRef.collection("candidates").doc(patch.candidateId), { shortlistStatus: patch.shortlistStatus });
      }
    }
  });

  return {
    ...calculation,
    mode: initial.mode,
    planningCycle: initial.trip.planningCycle,
    membershipVersion: initial.membershipVersion,
    representativeRouteSnapshotIds: travel.snapshotIds,
  };
}
