import { FieldPath, getFirestore, type Transaction } from "firebase-admin/firestore";
import { externalSnapshotSchema } from "@travel-planner/shared";
import { ExternalSnapshotStateError, type StoredExternalSnapshot } from "./externalSnapshots";

/** Bounded latest-by-semantic-cache-key read for race-sensitive orchestration. */
export async function loadLatestExternalSnapshotByCacheKeyInTransaction(
  transaction: Transaction,
  tripId: string,
  cacheKey: string,
): Promise<StoredExternalSnapshot | undefined> {
  const query = getFirestore()
    .collection("trips")
    .doc(tripId)
    .collection("externalSnapshots")
    .where("cacheKey", "==", cacheKey)
    .orderBy("fetchedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(1);
  const result = await transaction.get(query);
  const doc = result.docs[0];
  if (!doc) return undefined;
  const parsed = externalSnapshotSchema.safeParse(doc.data());
  if (!parsed.success) {
    throw new ExternalSnapshotStateError(`External snapshot ${doc.id} is malformed`);
  }
  return { id: doc.id, snapshot: parsed.data };
}
