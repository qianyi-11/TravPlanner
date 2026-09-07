import {
  Timestamp,
  getFirestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  externalSnapshotSchema,
  type ExternalSnapshot,
  type PersistedCriticalFact,
} from "@travel-planner/shared";

export interface StoredExternalSnapshot {
  id: string;
  snapshot: ExternalSnapshot;
}

export class ExternalSnapshotStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalSnapshotStateError";
  }
}

function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null) {
    const candidate = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") {
      return candidate.seconds * 1000 + Math.floor((candidate.nanoseconds ?? 0) / 1_000_000);
    }
  }
  throw new ExternalSnapshotStateError("External snapshot contains an invalid fetchedAt timestamp");
}

function parseStoredSnapshot(id: string, data: unknown): StoredExternalSnapshot {
  const parsed = externalSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    throw new ExternalSnapshotStateError(`External snapshot ${id} is malformed`);
  }
  return { id, snapshot: parsed.data };
}

export async function loadExternalSnapshotsByCacheKey(
  tripId: string,
  cacheKey: string,
): Promise<StoredExternalSnapshot[]> {
  const query = getFirestore()
    .collection("trips")
    .doc(tripId)
    .collection("externalSnapshots")
    .where("cacheKey", "==", cacheKey);
  const result = await query.get();
  return result.docs.map((doc: { id: string; data(): unknown }) =>
    parseStoredSnapshot(doc.id, doc.data())
  );
}

export async function loadExternalSnapshotsByCacheKeyInTransaction(
  transaction: Transaction,
  tripId: string,
  cacheKey: string,
): Promise<StoredExternalSnapshot[]> {
  const query = getFirestore()
    .collection("trips")
    .doc(tripId)
    .collection("externalSnapshots")
    .where("cacheKey", "==", cacheKey);
  const result = await transaction.get(query);
  return result.docs.map((doc: { id: string; data(): unknown }) =>
    parseStoredSnapshot(doc.id, doc.data())
  );
}

export async function loadExternalSnapshotsForCacheKeysInTransaction(
  transaction: Transaction,
  tripId: string,
  cacheKeys: readonly string[],
): Promise<Map<string, StoredExternalSnapshot[]>> {
  const uniqueKeys = [...new Set(cacheKeys)];
  const entries = await Promise.all(uniqueKeys.map(async cacheKey => [
    cacheKey,
    await loadExternalSnapshotsByCacheKeyInTransaction(transaction, tripId, cacheKey),
  ] as const));
  return new Map(entries);
}

function latestDataBearingSnapshot(
  snapshots: readonly StoredExternalSnapshot[],
  kind: "PLACE_DETAILS" | "ROUTE",
  provider: "GOOGLE_PLACES" | "GOOGLE_ROUTES",
): StoredExternalSnapshot | undefined {
  return snapshots
    .filter(entry =>
      entry.snapshot.kind === kind &&
      entry.snapshot.provider === provider &&
      entry.snapshot.data !== undefined,
    )
    .sort((left, right) => {
      const timeDifference = timestampMillis(right.snapshot.fetchedAt) - timestampMillis(left.snapshot.fetchedAt);
      return timeDifference !== 0 ? timeDifference : right.id.localeCompare(left.id);
    })[0];
}

async function persistExternalSnapshot(
  tripId: string,
  snapshot: ExternalSnapshot,
): Promise<StoredExternalSnapshot> {
  const parsed = externalSnapshotSchema.parse(snapshot);
  const ref = getFirestore()
    .collection("trips")
    .doc(tripId)
    .collection("externalSnapshots")
    .doc();
  await ref.create(parsed);
  return { id: ref.id, snapshot: parsed };
}

export async function getOrRefreshProviderSnapshot<T>(input: {
  tripId: string;
  cacheKey: string;
  kind: "PLACE_DETAILS" | "ROUTE";
  provider: "GOOGLE_PLACES" | "GOOGLE_ROUTES";
  source: string;
  ttlMs: number;
  fetchData: () => Promise<T>;
  now?: () => Timestamp;
}): Promise<StoredExternalSnapshot> {
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    throw new RangeError("External snapshot TTL must be positive");
  }

  const now = input.now?.() ?? Timestamp.now();
  const nowMs = now.toMillis();
  const existing = await loadExternalSnapshotsByCacheKey(input.tripId, input.cacheKey);
  const cached = latestDataBearingSnapshot(existing, input.kind, input.provider);

  if (cached) {
    const ageMs = nowMs - timestampMillis(cached.snapshot.fetchedAt);
    if (ageMs <= input.ttlMs) {
      return cached;
    }
  }

  try {
    const data = await input.fetchData();
    const candidate = input.kind === "PLACE_DETAILS"
      ? {
          provider: "GOOGLE_PLACES" as const,
          kind: "PLACE_DETAILS" as const,
          cacheKey: input.cacheKey,
          source: input.source,
          fetchedAt: now,
          freshness: "FRESH" as const,
          data,
        }
      : {
          provider: "GOOGLE_ROUTES" as const,
          kind: "ROUTE" as const,
          cacheKey: input.cacheKey,
          source: input.source,
          fetchedAt: now,
          freshness: "FRESH" as const,
          data,
        };
    const parsed = externalSnapshotSchema.parse(candidate);
    return persistExternalSnapshot(input.tripId, parsed);
  } catch (error) {
    if (cached && cached.snapshot.kind !== "CRITICAL_FACT" && cached.snapshot.data !== undefined) {
      const stale = externalSnapshotSchema.parse({
        ...cached.snapshot,
        freshness: "STALE",
      });
      return persistExternalSnapshot(input.tripId, stale);
    }

    const unavailable = externalSnapshotSchema.parse(input.kind === "PLACE_DETAILS"
      ? {
          provider: "GOOGLE_PLACES",
          kind: "PLACE_DETAILS",
          cacheKey: input.cacheKey,
          source: input.source,
          fetchedAt: now,
          freshness: "UNAVAILABLE",
        }
      : {
          provider: "GOOGLE_ROUTES",
          kind: "ROUTE",
          cacheKey: input.cacheKey,
          source: input.source,
          fetchedAt: now,
          freshness: "UNAVAILABLE",
        });
    const stored = await persistExternalSnapshot(input.tripId, unavailable);
    Object.defineProperty(stored, "providerError", {
      value: error,
      enumerable: false,
    });
    return stored;
  }
}

export function prepareUserConfirmedExternalSnapshot(input: {
  tripId: string;
  cacheKey: string;
  fact: PersistedCriticalFact;
  submittedBy: string;
  confirmedBy: string;
  confirmedAt: Timestamp;
}): { stored: StoredExternalSnapshot; write: (transaction: Transaction) => void } {
  const snapshot = externalSnapshotSchema.parse({
    provider: "USER_CONFIRMED",
    kind: "CRITICAL_FACT",
    cacheKey: input.cacheKey,
    source: "USER_CONFIRMED",
    fetchedAt: input.confirmedAt,
    freshness: "FRESH",
    submittedBy: input.submittedBy,
    confirmedBy: input.confirmedBy,
    confirmedAt: input.confirmedAt,
    data: input.fact,
  });
  const ref = getFirestore()
    .collection("trips")
    .doc(input.tripId)
    .collection("externalSnapshots")
    .doc();
  return {
    stored: { id: ref.id, snapshot },
    write: transaction => transaction.create(ref, snapshot),
  };
}

export function createUserConfirmedExternalSnapshotInTransaction(input: {
  transaction: Transaction;
  tripId: string;
  cacheKey: string;
  fact: PersistedCriticalFact;
  submittedBy: string;
  confirmedBy: string;
  confirmedAt: Timestamp;
}): StoredExternalSnapshot {
  const prepared = prepareUserConfirmedExternalSnapshot(input);
  prepared.write(input.transaction);
  return prepared.stored;
}

type UserConfirmedStoredSnapshot = StoredExternalSnapshot & {
  snapshot: Extract<ExternalSnapshot, { kind: "CRITICAL_FACT" }>;
};

export function selectLatestUserConfirmedSnapshot(
  snapshots: readonly StoredExternalSnapshot[],
): UserConfirmedStoredSnapshot | undefined {
  return snapshots
    .filter((entry): entry is UserConfirmedStoredSnapshot =>
      entry.snapshot.kind === "CRITICAL_FACT" &&
      entry.snapshot.provider === "USER_CONFIRMED" &&
      entry.snapshot.freshness === "FRESH",
    )
    .sort((left, right) => {
      const timeDifference = timestampMillis(right.snapshot.confirmedAt) - timestampMillis(left.snapshot.confirmedAt);
      return timeDifference !== 0 ? timeDifference : right.id.localeCompare(left.id);
    })[0];
}
