import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  activityBudgetReadSchema,
  activityBudgetWriteSchema,
  isCanonicalCurrencyCode,
  setActivityBudgetInputSchema,
  setActivityBudgetResultSchema,
  validateMonetaryPrecision,
} from "@travel-planner/shared";
import {
  authError,
  loadAuthoritativeMembershipState,
  loadTripAuthContextInTransaction,
  requireActiveMember,
  requireAuth,
  requirePhase,
  requirePlanningCycle,
} from "../auth";
import {
  recalculateSafeActivityBudgetCeiling,
  type MembershipActivityBudget,
} from "./recalculateSafeActivityBudgetCeiling";

interface SetActivityBudgetTransactionHooks {
  /** Integration-test synchronization hook. The public callable contract is unchanged. */
  afterAuthorityRead?: (input: { activityBudgetCurrency: string }) => void | Promise<void>;
}

export async function setActivityBudgetHandler(
  request: CallableRequest<unknown>,
  transactionHooks: SetActivityBudgetTransactionHooks = {},
) {
  const uid = requireAuth(request);
  const parseResult = setActivityBudgetInputSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw authError("INVALID_INPUT", "Invalid budget input.", {
      issues: parseResult.error.issues,
    });
  }
  const input = parseResult.data;
  const isClear = "clear" in input && input.clear === true;

  return getFirestore().runTransaction(async (transaction) => {
    const db = getFirestore();
    const tripRef = db.collection("trips").doc(input.tripId);

    // 1. READ trip + caller member
    const context = await loadTripAuthContextInTransaction(transaction, input.tripId, uid);

    // 2-4. CHEAP GUARDS
    requireActiveMember(context);
    requirePhase(context, ["COLLECTING", "VOTING"]);
    requirePlanningCycle(context, input.expectedPlanningCycle);

    // 5. AUTHORITATIVE MEMBERSHIP & BUDGET READS
    const state = await loadAuthoritativeMembershipState(transaction, input.tripId);

    // 6. Membership authority consistency
    if (state.activeOwnerId !== context.trip.ownerId || !state.activeOwnerId) {
      throw authError("CONFLICT", "Trip membership authority is inconsistent.", {
        tripId: input.tripId,
      });
    }

    // 7. VOTING solo guard
    if (state.isSolo && context.trip.phase === "VOTING") {
      throw authError("INVALID_PHASE", "Solo trip cannot vote.", {
        tripId: input.tripId,
        phase: context.trip.phase,
      });
    }

    // 8. Load all relevant ACTIVE-member budget documents
    const budgetRefs = state.activeMemberIds.map((memberId) =>
      tripRef.collection("activityBudgets").doc(memberId)
    );
    const budgetSnapshots = await Promise.all(budgetRefs.map((ref) => transaction.get(ref)));

    // Tests can pause the first transaction attempt after every authority read and before any write.
    // Firestore retries execute this point again with the newly committed trip state.
    await transactionHooks.afterAuthorityRead?.({
      activityBudgetCurrency: context.trip.activityBudgetCurrency,
    });

    // 9-10. Determine SET vs CLEAR and validate currency / precision
    const postMutationBudgets: MembershipActivityBudget[] = [];

    if (!isClear) {
      const amount = (input as { amount: number }).amount;
      if (!isCanonicalCurrencyCode(context.trip.activityBudgetCurrency)) {
        throw authError("INVALID_INPUT", "Trip currency is unsupported or non-canonical.", {
          tripId: input.tripId,
          currency: context.trip.activityBudgetCurrency,
        });
      }
      if (!validateMonetaryPrecision(amount, context.trip.activityBudgetCurrency)) {
        throw authError("INVALID_INPUT", "Amount exceeds allowed decimal precision for currency.", {
          tripId: input.tripId,
          amount,
          currency: context.trip.activityBudgetCurrency,
        });
      }
      postMutationBudgets.push({
        memberId: uid,
        amount,
        currency: context.trip.activityBudgetCurrency,
      });
    }

    // 11. Process other ACTIVE-member records
    for (const snapshot of budgetSnapshots) {
      if (snapshot.id === uid) {
        // Caller record is replaced or removed directly, ignoring old caller state
        continue;
      }
      if (!snapshot.exists) {
        continue;
      }
      const raw = snapshot.data();
      if (
        typeof raw !== "object" ||
        raw === null ||
        !("currency" in raw) ||
        typeof (raw as Record<string, unknown>).currency !== "string" ||
        !(raw as Record<string, unknown>).currency
      ) {
        throw authError("CONFLICT", "Activity budget state is malformed.", {
          tripId: input.tripId,
          targetId: snapshot.id,
        });
      }

      const rawCurrency = (raw as Record<string, unknown>).currency as string;
      if (rawCurrency !== context.trip.activityBudgetCurrency) {
        // Readable non-empty currency !== trip.activityBudgetCurrency: ignore as non-applicable old-currency
        continue;
      }

      const parsed = activityBudgetReadSchema.safeParse(raw);
      if (!parsed.success || parsed.data.memberId !== snapshot.id) {
        throw authError("CONFLICT", "Activity budget state is malformed.", {
          tripId: input.tripId,
          targetId: snapshot.id,
        });
      }

      postMutationBudgets.push({
        memberId: parsed.data.memberId,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
      });
    }

    // 12. Calculate post-mutation ceiling
    const safeActivityBudgetCeiling = recalculateSafeActivityBudgetCeiling({
      budgets: postMutationBudgets,
      activeMemberIds: state.activeMemberIds,
      activeOwnerId: state.activeOwnerId,
      currency: context.trip.activityBudgetCurrency,
    });

    // 13. Writes
    const callerBudgetRef = tripRef.collection("activityBudgets").doc(uid);
    if (isClear) {
      transaction.delete(callerBudgetRef);
    } else {
      const amount = (input as { amount: number }).amount;
      const budgetDocData = {
        memberId: uid,
        amount,
        currency: context.trip.activityBudgetCurrency,
        planningCycleUpdated: context.trip.planningCycle,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Validate write document against write schema
      activityBudgetWriteSchema.parse(budgetDocData);
      transaction.set(callerBudgetRef, budgetDocData);
    }

    // 14. Update trip ceiling
    transaction.update(tripRef, {
      safeActivityBudgetCeiling: safeActivityBudgetCeiling ?? FieldValue.delete(),
    });

    return setActivityBudgetResultSchema.parse({
      safeActivityBudgetCeiling,
      phase: context.trip.phase,
      planningCycle: context.trip.planningCycle,
      cleared: isClear,
    });
  });
}

export const setActivityBudget = onCall(
  { enforceAppCheck: true },
  request => setActivityBudgetHandler(request),
);
