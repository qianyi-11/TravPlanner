import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  ITINERARY_VARIANTS,
  candidateDocumentSchema,
  generatePlanningCycleResultSchema,
  itineraryOptionDocumentSchema,
  legacyCandidateVoteReadSchema,
  validationSnapshotDocumentSchema,
  timeToMinutes,
  type CandidateDocument,
  type GeneratePlanningCycleResult,
  type ItineraryOptionDocument,
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
import { getGooglePlaceDetailsSnapshot } from "../integrations/google/placeDetails";
import { getGoogleRouteSnapshot } from "../integrations/google/routes";
import type { StoredExternalSnapshot } from "../integrations/externalSnapshots";
import { runAuthoritativeShortlist } from "../shortlist";
import {
  buildValidationSnapshotDocument,
  evaluateItineraryValidation,
  loadAndEvaluateCandidateValidationInTransaction,
  type CandidateValidationOutput,
  type SameDayInterval,
} from "../validation";
import { aggregateCandidateVotes } from "../voting/candidateVoteAggregation";
import { planningVariantOrders } from "./variants";
import { itineraryDaysIdentity, proposePlanningOption } from "./schedule";
import type {
  LockedPlanningBooking,
  PlanningAuthorityFingerprintInput,
  PlanningCandidate,
  PlanningLocation,
  ProposedPlanningOption,
} from "./types";

type PlaceDetailsResolver = typeof getGooglePlaceDetailsSnapshot;
type RouteResolver = typeof getGoogleRouteSnapshot;

interface PlanningAuthority {
  trip: TripDocument;
  activeMemberIds: string[];
  candidates: Map<string, CandidateDocument>;
  fixedBookings: LockedPlanningBooking[];
  confirmedBookingIntervals: SameDayInterval[];
  fingerprint: string;
}

interface BaseCandidateState {
  planningCandidate: PlanningCandidate;
  validation: CandidateValidationOutput;
  placeDetailsSnapshot: StoredExternalSnapshot;
}

interface ValidatedOption {
  proposal: ProposedPlanningOption;
  evaluation: ReturnType<typeof evaluateItineraryValidation>["evaluation"];
  externalSnapshotIds: string[];
}

function planningLocation(candidate: CandidateDocument): PlanningLocation {
  return {
    placeId: candidate.placeId,
    name: candidate.name,
    lat: candidate.location.lat,
    lng: candidate.location.lng,
  };
}

function authorityFingerprint(input: PlanningAuthorityFingerprintInput): string {
  return JSON.stringify({
    trip: {
      ownerId: input.trip.ownerId,
      phase: input.trip.phase,
      planningCycle: input.trip.planningCycle,
      membershipVersion: input.trip.membershipVersion,
      votingBasisMembershipVersion: input.trip.votingBasisMembershipVersion,
      startDate: input.trip.startDate,
      endDate: input.trip.endDate,
      timezone: input.trip.timezone,
      baseLocation: input.trip.baseLocation,
      defaultDayWindow: input.trip.defaultDayWindow,
      dayOverrides: input.trip.dayOverrides,
      primaryTransport: input.trip.primaryTransport,
      activityBudgetCurrency: input.trip.activityBudgetCurrency,
      safeActivityBudgetCeiling: input.trip.safeActivityBudgetCeiling,
    },
    activeMemberIds: [...input.activeMemberIds].sort(),
    candidateAuthority: [...input.candidateAuthority].sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    confirmedBookings: [...input.confirmedBookings].sort((a, b) =>
      a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.bookingId.localeCompare(b.bookingId),
    ),
  });
}

async function preparePlanningPhase(input: {
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
}): Promise<{ planningCycle: number; membershipVersion: number }> {
  return getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, input.ownerId);
    requireOwner(context);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    const membership = await loadAuthoritativeMembershipState(transaction, input.tripId);
    if (membership.activeOwnerId !== input.ownerId || membership.activeOwnerId !== context.trip.ownerId) {
      throw authError("CONFLICT", "Trip OWNER authority is inconsistent.", { tripId: input.tripId });
    }

    if (context.trip.phase === "COLLECTING") {
      if (!membership.isSolo) {
        throw authError("INVALID_PHASE", "Group planning requires PLANNING phase.", { tripId: input.tripId });
      }
      transaction.update(getFirestore().collection("trips").doc(input.tripId), {
        phase: "PLANNING",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      requirePhase(context, ["PLANNING"]);
    }

    return {
      planningCycle: context.trip.planningCycle,
      membershipVersion: context.trip.membershipVersion,
    };
  });
}

async function loadExistingValidOptionIdsInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  planningCycle: number;
}): Promise<string[]> {
  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const snapshots = await input.transaction.get(
    tripRef.collection("itineraryOptions").where("planningCycle", "==", input.planningCycle),
  );
  const valid: Array<{ id: string; option: ItineraryOptionDocument }> = [];
  for (const snapshot of snapshots.docs) {
    const parsed = itineraryOptionDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Current-cycle itinerary option is malformed.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    const validationRef = tripRef.collection("validationSnapshots").doc(parsed.data.validationSnapshotId);
    const validationSnapshot = await input.transaction.get(validationRef);
    const validation = validationSnapshotDocumentSchema.safeParse(validationSnapshot.data());
    if (!validation.success) {
      throw authError("CONFLICT", "Itinerary option validation authority is missing or malformed.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    if (
      validation.data.planningCycle === input.planningCycle &&
      validation.data.scope === "ITINERARY_OPTION" &&
      validation.data.targetId === snapshot.id &&
      validation.data.result !== "INVALID" &&
      validation.data.schedulable
    ) {
      valid.push({ id: snapshot.id, option: parsed.data });
    }
  }
  if (valid.length > 3) {
    throw authError("CONFLICT", "More than three valid current-cycle itinerary options exist.", { tripId: input.tripId });
  }
  return valid
    .sort((left, right) =>
      ITINERARY_VARIANTS.indexOf(left.option.variant) - ITINERARY_VARIANTS.indexOf(right.option.variant) ||
      left.id.localeCompare(right.id),
    )
    .map(entry => entry.id);
}

async function loadExistingValidOptionIds(input: {
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
}): Promise<string[]> {
  return getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, input.ownerId);
    requireOwner(context);
    requirePhase(context, ["PLANNING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);
    return loadExistingValidOptionIdsInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: context.trip.planningCycle,
    });
  });
}

async function loadPlanningAuthorityInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
  expectedMembershipVersion: number;
  selectedCandidateIds: readonly string[];
}): Promise<PlanningAuthority> {
  const context = await loadTripAuthContextInTransaction(input.transaction, input.tripId, input.ownerId);
  requireOwner(context);
  requirePhase(context, ["PLANNING"]);
  requirePlanningCycle(context, input.expectedPlanningCycle);
  requireMembershipVersion(context, input.expectedMembershipVersion);
  const membership = await loadAuthoritativeMembershipState(input.transaction, input.tripId);
  if (membership.activeOwnerId !== input.ownerId || membership.activeOwnerId !== context.trip.ownerId) {
    throw authError("CONFLICT", "Trip OWNER authority is inconsistent.", { tripId: input.tripId });
  }

  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const candidates = new Map<string, CandidateDocument>();
  for (const candidateId of [...new Set(input.selectedCandidateIds)].sort()) {
    const snapshot = await input.transaction.get(tripRef.collection("candidates").doc(candidateId));
    const parsed = candidateDocumentSchema.safeParse(snapshot.data());
    if (!parsed.success || !parsed.data.active || parsed.data.shortlistStatus !== "SHORTLISTED") {
      throw authError("CONFLICT", "Shortlisted candidate authority changed.", {
        tripId: input.tripId,
        targetId: candidateId,
      });
    }
    candidates.set(candidateId, parsed.data);
  }

  const bookingSnapshots = await input.transaction.get(
    tripRef.collection("fixedBookings").where("status", "==", "CONFIRMED"),
  );
  const bookingRows: Array<{
    bookingId: string;
    candidateId: string;
    date: string;
    startMinute: number;
    endMinute: number;
  }> = [];
  for (const snapshot of bookingSnapshots.docs) {
    const parsed = parsePersistedFixedBookingOrThrow(snapshot.data(), snapshot.id, input.tripId);
    const startMinute = timeToMinutes(parsed.normalizedTiming.startTime);
    const endMinute = timeToMinutes(parsed.normalizedTiming.endTime);
    if (startMinute === null || endMinute === null || startMinute >= endMinute) {
      throw authError("CONFLICT", "Confirmed fixed booking timing is invalid.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    bookingRows.push({
      bookingId: snapshot.id,
      candidateId: parsed.booking.candidateId,
      date: parsed.booking.date,
      startMinute,
      endMinute,
    });
    if (!candidates.has(parsed.booking.candidateId)) {
      const candidateSnapshot = await input.transaction.get(
        tripRef.collection("candidates").doc(parsed.booking.candidateId),
      );
      const candidate = candidateDocumentSchema.safeParse(candidateSnapshot.data());
      if (!candidate.success) {
        throw authError("CONFLICT", "Confirmed fixed booking candidate is missing or malformed.", {
          tripId: input.tripId,
          targetId: snapshot.id,
        });
      }
      candidates.set(parsed.booking.candidateId, candidate.data);
    }
  }

  const fixedBookings: LockedPlanningBooking[] = bookingRows.map(booking => {
    const candidate = candidates.get(booking.candidateId);
    if (!candidate) throw new Error("Fixed booking candidate was not loaded");
    return {
      ...booking,
      title: candidate.name,
      location: planningLocation(candidate),
    };
  });
  const confirmedBookingIntervals: SameDayInterval[] = bookingRows.map(booking => ({
    date: booking.date,
    startMinute: booking.startMinute,
    endMinute: booking.endMinute,
  }));

  const selectedAuthority = [...new Set(input.selectedCandidateIds)].map(candidateId => {
    const candidate = candidates.get(candidateId);
    if (!candidate) throw new Error("Selected candidate was not loaded");
    return {
      candidateId,
      active: candidate.active,
      activationVersion: candidate.activationVersion,
      shortlistStatus: candidate.shortlistStatus,
    };
  });
  const fingerprint = authorityFingerprint({
    trip: context.trip,
    activeMemberIds: membership.activeMemberIds,
    candidateAuthority: selectedAuthority,
    confirmedBookings: bookingRows,
  });
  return {
    trip: context.trip,
    activeMemberIds: [...membership.activeMemberIds].sort(),
    candidates,
    fixedBookings,
    confirmedBookingIntervals,
    fingerprint,
  };
}

async function loadVotePreference(input: {
  transaction: Transaction;
  tripId: string;
  authority: PlanningAuthority;
  selectedCandidateIds: readonly string[];
  mode: "GROUP" | "SOLO";
}): Promise<Record<string, number>> {
  if (input.mode === "SOLO") return {};
  const tripRef = getFirestore().collection("trips").doc(input.tripId);
  const snapshots = await input.transaction.get(
    tripRef.collection("candidateVotes").where("planningCycle", "==", input.authority.trip.planningCycle),
  );
  const votes = snapshots.docs.map(snapshot => {
    const parsed = legacyCandidateVoteReadSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw authError("CONFLICT", "Candidate vote state is malformed.", {
        tripId: input.tripId,
        targetId: snapshot.id,
      });
    }
    return parsed.data;
  });
  const aggregates = aggregateCandidateVotes({
    votes,
    activeMemberIds: input.authority.activeMemberIds,
    planningCycle: input.authority.trip.planningCycle,
    candidates: input.selectedCandidateIds.map(candidateId => {
      const candidate = input.authority.candidates.get(candidateId);
      if (!candidate) throw new Error("Selected candidate was not loaded");
      return {
        candidateId,
        active: candidate.active,
        activationVersion: candidate.activationVersion,
      };
    }),
  });
  return Object.fromEntries(
    input.selectedCandidateIds.map(candidateId => [candidateId, aggregates[candidateId]?.scoreTotal ?? 0]),
  );
}

async function baseValidateCandidates(input: {
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
  membershipVersion: number;
  authority: PlanningAuthority;
  orderedCandidateIds: readonly string[];
  mustDoCandidateIds: ReadonlySet<string>;
  mode: "GROUP" | "SOLO";
  placeDetailsResolver: PlaceDetailsResolver;
}): Promise<{
  candidates: BaseCandidateState[];
  conflictReasonCodes: string[];
}> {
  const placeSnapshots = new Map<string, StoredExternalSnapshot>();
  for (const candidateId of input.orderedCandidateIds) {
    const candidate = input.authority.candidates.get(candidateId);
    if (!candidate) throw new Error("Selected candidate was not loaded");
    const snapshot = await input.placeDetailsResolver({
      tripId: input.tripId,
      placeId: candidate.placeId,
      tripTimezone: input.authority.trip.timezone,
      tripStartDate: input.authority.trip.startDate,
      tripEndDate: input.authority.trip.endDate,
    });
    placeSnapshots.set(candidateId, snapshot);
  }

  const votePreference = await getFirestore().runTransaction(transaction =>
    loadVotePreference({
      transaction,
      tripId: input.tripId,
      authority: input.authority,
      selectedCandidateIds: input.orderedCandidateIds,
      mode: input.mode,
    }),
  );

  const candidates: BaseCandidateState[] = [];
  const conflictReasonCodes = new Set<string>();
  for (let priorityIndex = 0; priorityIndex < input.orderedCandidateIds.length; priorityIndex += 1) {
    const candidateId = input.orderedCandidateIds[priorityIndex];
    const candidate = input.authority.candidates.get(candidateId);
    const placeDetailsSnapshot = placeSnapshots.get(candidateId);
    if (!candidate || !placeDetailsSnapshot) throw new Error("Planning candidate provider state is missing");
    const validation = await getFirestore().runTransaction(async transaction => {
      const context = await loadTripAuthContextInTransaction(transaction, input.tripId, input.ownerId);
      requireOwner(context);
      requirePhase(context, ["PLANNING"]);
      requirePlanningCycle(context, input.expectedPlanningCycle);
      requireMembershipVersion(context, input.membershipVersion);
      return loadAndEvaluateCandidateValidationInTransaction({
        transaction,
        tripId: input.tripId,
        trip: context.trip,
        candidateId,
        placeDetailsSnapshot,
      });
    });
    if (!validation.evaluation.schedulable || validation.expectedDuration.kind === "MISSING") {
      for (const reason of validation.evaluation.reasonCodes) conflictReasonCodes.add(reason);
      continue;
    }
    candidates.push({
      validation,
      placeDetailsSnapshot,
      planningCandidate: {
        candidateId,
        title: candidate.name,
        location: planningLocation(candidate),
        durationMinutes: validation.expectedDuration.durationMinutes,
        mustDo: input.mustDoCandidateIds.has(candidateId),
        priorityIndex,
        votePreference: input.mode === "GROUP" ? (votePreference[candidateId] ?? 0) : 0,
        authoritativeVisitWindows: validation.authoritativeVisitWindows,
        ...(validation.knownPrice ? { knownPrice: validation.knownPrice.amount } : {}),
      },
    });
  }
  return { candidates, conflictReasonCodes: [...conflictReasonCodes].sort() };
}

function uniqueProposals(proposals: readonly ProposedPlanningOption[]): ProposedPlanningOption[] {
  const seen = new Set<string>();
  const result: ProposedPlanningOption[] = [];
  for (const proposal of proposals) {
    const key = itineraryDaysIdentity(proposal.days);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(proposal);
  }
  return result;
}

async function persistValidatedOptions(input: {
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
  membershipVersion: number;
  initialAuthority: PlanningAuthority;
  orderedCandidateIds: readonly string[];
  baseCandidates: readonly BaseCandidateState[];
  proposals: readonly ProposedPlanningOption[];
  initialConflictReasonCodes: readonly string[];
}): Promise<GeneratePlanningCycleResult> {
  return getFirestore().runTransaction(async transaction => {
    const currentAuthority = await loadPlanningAuthorityInTransaction({
      transaction,
      tripId: input.tripId,
      ownerId: input.ownerId,
      expectedPlanningCycle: input.expectedPlanningCycle,
      expectedMembershipVersion: input.membershipVersion,
      selectedCandidateIds: input.orderedCandidateIds,
    });
    if (currentAuthority.fingerprint !== input.initialAuthority.fingerprint) {
      throw authError("CONFLICT", "Planning authority changed while provider/planner work was running.", {
        tripId: input.tripId,
      });
    }

    const existing = await loadExistingValidOptionIdsInTransaction({
      transaction,
      tripId: input.tripId,
      planningCycle: currentAuthority.trip.planningCycle,
    });
    if (existing.length > 0) {
      return generatePlanningCycleResultSchema.parse({
        planningCycle: currentAuthority.trip.planningCycle,
        optionIds: existing,
        conflictReasonCodes: [],
        reusedExistingOptions: true,
      });
    }

    const baseById = new Map(input.baseCandidates.map(entry => [entry.planningCandidate.candidateId, entry]));
    const conflictReasonCodes = new Set(input.initialConflictReasonCodes);
    const validOptions: ValidatedOption[] = [];

    for (const proposal of input.proposals) {
      if (proposal.unsatisfiedMustDoCandidateIds.length > 0 || proposal.representedCandidateIds.length === 0) {
        conflictReasonCodes.add("MUST_DO_CONFLICT");
        continue;
      }
      const candidateValidations: CandidateValidationOutput[] = [];
      const activityIntervals: SameDayInterval[] = [];
      for (const placement of proposal.candidatePlacements) {
        const base = baseById.get(placement.candidateId);
        if (!base) {
          throw authError("CONFLICT", "Proposed option references a candidate outside detailed validation.", {
            tripId: input.tripId,
            targetId: placement.candidateId,
          });
        }
        const interval: SameDayInterval = {
          date: placement.date,
          startMinute: placement.startMinute,
          endMinute: placement.endMinute,
        };
        const validation = await loadAndEvaluateCandidateValidationInTransaction({
          transaction,
          tripId: input.tripId,
          trip: currentAuthority.trip,
          candidateId: placement.candidateId,
          placeDetailsSnapshot: base.placeDetailsSnapshot,
          placement: {
            interval,
            confirmedBookingIntervals: currentAuthority.confirmedBookingIntervals,
          },
        });
        if (
          validation.knownPrice?.amount !== base.validation.knownPrice?.amount ||
          validation.knownPrice?.currency !== base.validation.knownPrice?.currency
        ) {
          throw authError("CONFLICT", "Candidate price authority changed during planning.", {
            tripId: input.tripId,
            targetId: placement.candidateId,
          });
        }
        candidateValidations.push(validation);
        activityIntervals.push(interval);
      }

      const itineraryValidation = evaluateItineraryValidation({
        candidateValidations,
        activityIntervals,
        routeLegs: proposal.routeLegs,
        routeSetComplete: proposal.routeSetComplete,
        currency: currentAuthority.trip.activityBudgetCurrency,
        safeActivityBudgetCeiling: currentAuthority.trip.safeActivityBudgetCeiling,
      });
      if (itineraryValidation.evaluation.result === "INVALID" || !itineraryValidation.evaluation.schedulable) {
        for (const reason of itineraryValidation.evaluation.reasonCodes) conflictReasonCodes.add(reason);
        continue;
      }
      validOptions.push({
        proposal,
        evaluation: itineraryValidation.evaluation,
        externalSnapshotIds: itineraryValidation.externalSnapshotIds,
      });
    }

    if (validOptions.length === 0) {
      throw authError("NO_FEASIBLE_OPTIONS", "No Validator-accepted itinerary option could be produced.", {
        tripId: input.tripId,
        detail: [...conflictReasonCodes].sort().join(","),
      });
    }

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const createdAt = Timestamp.now();
    const optionIds: string[] = [];
    for (const valid of validOptions.slice(0, 3)) {
      const optionRef = tripRef.collection("itineraryOptions").doc();
      const validationRef = tripRef.collection("validationSnapshots").doc();
      const validationDocument = buildValidationSnapshotDocument({
        planningCycle: currentAuthority.trip.planningCycle,
        scope: "ITINERARY_OPTION",
        targetId: optionRef.id,
        evaluation: valid.evaluation,
        externalSnapshotIds: valid.externalSnapshotIds,
        checkedAt: createdAt,
      });
      const optionDocument = itineraryOptionDocumentSchema.parse({
        planningCycle: currentAuthority.trip.planningCycle,
        variant: valid.proposal.variant,
        days: valid.proposal.days,
        score: valid.proposal.score,
        validationSnapshotId: validationRef.id,
        createdAt,
      });
      transaction.create(validationRef, validationDocument);
      transaction.create(optionRef, optionDocument);
      optionIds.push(optionRef.id);
    }

    return generatePlanningCycleResultSchema.parse({
      planningCycle: currentAuthority.trip.planningCycle,
      optionIds,
      conflictReasonCodes: [...conflictReasonCodes].sort(),
      reusedExistingOptions: false,
    });
  });
}

export async function runAuthoritativePlanning(input: {
  tripId: string;
  ownerId: string;
  expectedPlanningCycle: number;
  placeDetailsResolver?: PlaceDetailsResolver;
  routeResolver?: RouteResolver;
}): Promise<GeneratePlanningCycleResult> {
  const placeDetailsResolver = input.placeDetailsResolver ?? getGooglePlaceDetailsSnapshot;
  const rawRouteResolver = input.routeResolver ?? getGoogleRouteSnapshot;
  const routeResolver: RouteResolver = async routeInput => {
    try {
      return await rawRouteResolver(routeInput);
    } catch (error) {
      throw authError("EXTERNAL_DATA_UNAVAILABLE", "Route provider data is unavailable.", {
        tripId: input.tripId,
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };
  const safePlaceDetailsResolver: PlaceDetailsResolver = async placeInput => {
    try {
      return await placeDetailsResolver(placeInput);
    } catch (error) {
      throw authError("EXTERNAL_DATA_UNAVAILABLE", "Place provider data is unavailable.", {
        tripId: input.tripId,
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const prepared = await preparePlanningPhase(input);
  const existing = await loadExistingValidOptionIds(input);
  if (existing.length > 0) {
    return generatePlanningCycleResultSchema.parse({
      planningCycle: prepared.planningCycle,
      optionIds: existing,
      conflictReasonCodes: [],
      reusedExistingOptions: true,
    });
  }

  const shortlist = await runAuthoritativeShortlist({
    tripId: input.tripId,
    ownerId: input.ownerId,
    expectedPlanningCycle: input.expectedPlanningCycle,
    routeResolver,
  });
  const selectedCandidateIds = shortlist.orderedSelectedCandidateIds;
  if (selectedCandidateIds.length === 0) {
    throw authError("NO_SCHEDULABLE_CANDIDATES", "No candidate is available for detailed planning.", {
      tripId: input.tripId,
    });
  }

  const initialAuthority = await getFirestore().runTransaction(transaction =>
    loadPlanningAuthorityInTransaction({
      transaction,
      tripId: input.tripId,
      ownerId: input.ownerId,
      expectedPlanningCycle: input.expectedPlanningCycle,
      expectedMembershipVersion: shortlist.membershipVersion,
      selectedCandidateIds,
    }),
  );
  const mustDoCandidateIds = new Set(shortlist.mustDoCandidateIds);
  const base = await baseValidateCandidates({
    tripId: input.tripId,
    ownerId: input.ownerId,
    expectedPlanningCycle: input.expectedPlanningCycle,
    membershipVersion: shortlist.membershipVersion,
    authority: initialAuthority,
    orderedCandidateIds: selectedCandidateIds,
    mustDoCandidateIds,
    mode: shortlist.mode,
    placeDetailsResolver: safePlaceDetailsResolver,
  });
  if (base.candidates.length === 0) {
    throw authError("NO_SCHEDULABLE_CANDIDATES", "No shortlisted candidate passed detailed candidate Validation.", {
      tripId: input.tripId,
      detail: base.conflictReasonCodes.join(","),
    });
  }

  const fixedCandidateIds = new Set(initialAuthority.fixedBookings.map(booking => booking.candidateId));
  const schedulableIds = new Set(base.candidates.map(entry => entry.planningCandidate.candidateId));
  const unresolvedMustDo = shortlist.mustDoCandidateIds.filter(candidateId =>
    !fixedCandidateIds.has(candidateId) && !schedulableIds.has(candidateId),
  );
  if (unresolvedMustDo.length > 0) {
    throw authError("NO_FEASIBLE_OPTIONS", "A protected MUST_DO candidate is not schedulable.", {
      tripId: input.tripId,
      detail: unresolvedMustDo.join(","),
    });
  }

  const planningCandidates = base.candidates.map(entry => entry.planningCandidate);
  const orders = planningVariantOrders({
    candidates: planningCandidates,
    base: initialAuthority.trip.baseLocation,
  });
  const proposals: ProposedPlanningOption[] = [];
  for (const order of orders) {
    proposals.push(await proposePlanningOption({
      tripId: input.tripId,
      trip: initialAuthority.trip,
      variant: order.variant,
      orderedCandidates: order.candidates,
      allShortlistedCandidates: planningCandidates,
      fixedBookings: initialAuthority.fixedBookings,
      routeResolver,
    }));
  }

  return persistValidatedOptions({
    tripId: input.tripId,
    ownerId: input.ownerId,
    expectedPlanningCycle: input.expectedPlanningCycle,
    membershipVersion: shortlist.membershipVersion,
    initialAuthority,
    orderedCandidateIds: selectedCandidateIds,
    baseCandidates: base.candidates,
    proposals: uniqueProposals(proposals),
    initialConflictReasonCodes: base.conflictReasonCodes,
  });
}
