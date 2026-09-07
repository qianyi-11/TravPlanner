import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  candidateDocumentSchema,
  candidateProviderFactsSchema,
  MAX_MUST_DO_SUBMISSIONS_PER_MEMBER,
  MAX_SUBMISSIONS_PER_MEMBER,
  submissionDocumentSchema,
  submitCandidateInputSchema,
  submitCandidateResultSchema,
  type SubmissionDocument,
} from "@travel-planner/shared";
import { authError, loadTripAuthContextInTransaction, requireActiveMember, requireAuth, requirePhase, requirePlanningCycle } from "../auth";
import {
  GOOGLE_MAPS_API_KEY,
  PlaceResolutionError,
  resolvePlace,
  type NormalizedPlace,
  type PlaceResolver,
} from "../integrations/google/places";
import { candidateIdFromPlaceId, submissionIdForCandidate } from "./candidateIdentity";

export function submitCandidateHandler(request: CallableRequest<unknown>) {
  return submitCandidateHandlerWithResolver(request, resolvePlace);
}

export async function submitCandidateHandlerWithResolver(
  request: CallableRequest<unknown>,
  placeResolver: PlaceResolver,
  // Test-only: deterministic emulator ordering without persisted synchronization state.
  testHooks?: { beforeTransaction?: () => Promise<void> },
) {
  const uid = requireAuth(request);
  const parsed = submitCandidateInputSchema.safeParse(request.data);
  if (!parsed.success || parsed.data.durationSource === "SYSTEM") {
    throw authError("INVALID_INPUT", "Candidate submission input is invalid.");
  }

  const input = parsed.data;
  const place = await resolveCandidatePlace(placeResolver, input.placeId);
  await testHooks?.beforeTransaction?.();
  const candidateId = candidateIdFromPlaceId(place.placeId);
  const submissionId = submissionIdForCandidate(uid, candidateId);

  const result = await getFirestore().runTransaction(async transaction => {
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);
    requireActiveMember(context);
    requirePhase(context, ["COLLECTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    const tripRef = getFirestore().collection("trips").doc(input.tripId);
    const candidateRef = tripRef.collection("candidates").doc(candidateId);
    const submissionRef = tripRef.collection("submissions").doc(submissionId);
    const memberSubmissionsSnapshot = await transaction.get(
      tripRef.collection("submissions").where("memberId", "==", uid),
    );
    const candidateSnapshot = await transaction.get(candidateRef);
    const ownSubmissionSnapshot = await transaction.get(submissionRef);

    if (ownSubmissionSnapshot.exists) {
      if (!candidateSnapshot.exists) {
        throw authError("CONFLICT", "Candidate and submission state is inconsistent.", { tripId: input.tripId, targetId: candidateId });
      }
      const candidate = parseCandidate(candidateSnapshot.data(), candidateId, input.tripId);
      const submission = parseSubmission(ownSubmissionSnapshot.data(), submissionId, input.tripId);
      if (submission.memberId !== uid || submission.candidateId !== candidateId || candidate.placeId !== place.placeId) {
        throw authError("CONFLICT", "Candidate and submission identity is inconsistent.", { tripId: input.tripId, targetId: candidateId });
      }
      if (!sameEditableValues(submission, input)) {
        throw authError("CONFLICT", "The submission already exists with different values.", { tripId: input.tripId, targetId: candidateId });
      }
      return submitCandidateResultSchema.parse({ candidateId, submissionId, deduplicated: true, warningCodes: [] });
    }

    const memberSubmissions = memberSubmissionsSnapshot.docs.map(snapshot =>
      parseSubmission(snapshot.data(), snapshot.id, input.tripId),
    );
    if (memberSubmissions.length >= MAX_SUBMISSIONS_PER_MEMBER) {
      throw authError("LIMIT_EXCEEDED", "A member may submit at most five candidates.", { tripId: input.tripId });
    }
    if (input.preference === "MUST_DO" && memberSubmissions.filter(submission => submission.preference === "MUST_DO").length >= MAX_MUST_DO_SUBMISSIONS_PER_MEMBER) {
      throw authError("LIMIT_EXCEEDED", "A member may mark at most two candidates as MUST_DO.", { tripId: input.tripId });
    }

    const timestamp = FieldValue.serverTimestamp();
    let deduplicated = true;
    if (!candidateSnapshot.exists) {
      const candidate = {
        placeId: place.placeId,
        name: place.name,
        ...(place.formattedAddress === undefined ? {} : { formattedAddress: place.formattedAddress }),
        location: place.location,
        placeTypes: place.placeTypes,
        environment: "UNKNOWN" as const,
        active: true,
        activationVersion: 1,
        shortlistStatus: "PENDING" as const,
        firstSubmittedBy: uid,
        firstSubmittedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      candidateDocumentSchema.parse(candidate);
      transaction.create(candidateRef, candidate);
      deduplicated = false;
    } else {
      const candidate = parseCandidate(candidateSnapshot.data(), candidateId, input.tripId);
      if (candidate.placeId !== place.placeId) {
        throw authError("CONFLICT", "Candidate identity is inconsistent.", { tripId: input.tripId, targetId: candidateId });
      }
      if (!candidate.active) {
        transaction.update(candidateRef, {
          active: true,
          activationVersion: candidate.activationVersion + 1,
          shortlistStatus: "PENDING",
          updatedAt: timestamp,
        });
      }
    }

    const submission = {
      candidateId,
      memberId: uid,
      preference: input.preference,
      preferredPeriod: input.preferredPeriod,
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      durationSource: input.durationSource,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    submissionDocumentSchema.parse(submission);
    transaction.create(submissionRef, submission);

    return submitCandidateResultSchema.parse({ candidateId, submissionId, deduplicated, warningCodes: [] });
  });

  return result;
}

export const submitCandidate = onCall(
  { enforceAppCheck: true, secrets: [GOOGLE_MAPS_API_KEY] },
  submitCandidateHandler,
);

async function resolveCandidatePlace(placeResolver: PlaceResolver, requestedPlaceId: string) {
  let place: NormalizedPlace;
  try {
    place = await placeResolver(requestedPlaceId);
  } catch (error) {
    if (error instanceof PlaceResolutionError && error.reason === "NOT_FOUND") {
      throw authError("NOT_FOUND", "Place was not found.");
    }
    throw authError("EXTERNAL_DATA_UNAVAILABLE", "Place data is unavailable.");
  }

  if (!place || typeof place !== "object") {
    throw authError("EXTERNAL_DATA_UNAVAILABLE", "Place data is unavailable.");
  }

  const facts = candidateProviderFactsSchema.safeParse({
    placeId: place.placeId,
    name: place.name,
    ...(place.formattedAddress === undefined ? {} : { formattedAddress: place.formattedAddress }),
    location: { lat: place.lat, lng: place.lng },
    placeTypes: place.placeTypes,
  });
  if (!facts.success) {
    throw authError("EXTERNAL_DATA_UNAVAILABLE", "Place data is unavailable.");
  }
  return facts.data;
}

function parseCandidate(data: unknown, candidateId: string, tripId: string) {
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

function sameEditableValues(submission: SubmissionDocument, input: ReturnType<typeof submitCandidateInputSchema.parse>): boolean {
  return submission.preference === input.preference &&
    submission.preferredPeriod === input.preferredPeriod &&
    submission.estimatedDurationMinutes === input.estimatedDurationMinutes &&
    submission.durationSource === input.durationSource &&
    Object.prototype.hasOwnProperty.call(submission, "notes") === Object.prototype.hasOwnProperty.call(input, "notes") &&
    submission.notes === input.notes;
}
