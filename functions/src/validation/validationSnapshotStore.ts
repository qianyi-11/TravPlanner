import {
  Timestamp,
  getFirestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  validationSnapshotDocumentSchema,
  type ValidationScope,
} from "@travel-planner/shared";
import type { ValidationEvaluation } from "./types";

export function buildValidationSnapshotDocument(input: {
  planningCycle: number;
  scope: ValidationScope;
  targetId: string;
  evaluation: ValidationEvaluation;
  externalSnapshotIds: readonly string[];
  checkedAt?: Timestamp;
}) {
  const externalSnapshotIds = [...new Set(input.externalSnapshotIds)].sort();
  return validationSnapshotDocumentSchema.parse({
    planningCycle: input.planningCycle,
    scope: input.scope,
    targetId: input.targetId,
    result: input.evaluation.result,
    schedulable: input.evaluation.schedulable,
    reasonCodes: input.evaluation.reasonCodes,
    hardChecks: input.evaluation.hardChecks,
    externalSnapshotIds,
    checkedAt: input.checkedAt ?? Timestamp.now(),
  });
}

export function createValidationSnapshotInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  planningCycle: number;
  scope: ValidationScope;
  targetId: string;
  evaluation: ValidationEvaluation;
  externalSnapshotIds: readonly string[];
  checkedAt?: Timestamp;
}): string {
  const document = buildValidationSnapshotDocument(input);
  const ref = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("validationSnapshots")
    .doc();
  input.transaction.create(ref, document);
  return ref.id;
}

export async function createValidationSnapshot(input: {
  tripId: string;
  planningCycle: number;
  scope: ValidationScope;
  targetId: string;
  evaluation: ValidationEvaluation;
  externalSnapshotIds: readonly string[];
  checkedAt?: Timestamp;
}): Promise<string> {
  const document = buildValidationSnapshotDocument(input);
  const ref = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("validationSnapshots")
    .doc();
  await ref.create(document);
  return ref.id;
}
