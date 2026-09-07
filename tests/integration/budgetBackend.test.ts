import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, beforeAll } from "vitest";
import { setActivityBudgetHandler } from "../../functions/src/budget/setActivityBudget";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { leaveTripHandler } from "../../functions/src/membership/leaveTrip";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { startVotingHandler } from "../../functions/src/voting/startVoting";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = runWithEmulator ? describe : describe.skip;

const placeResolver: PlaceResolver = async (placeId) => ({
  placeId,
  name: placeId === "destination" ? "Destination" : "Base",
  lat: 3.139,
  lng: 101.6869,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: [],
});

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return {
    data,
    auth: {
      uid,
      token: {
        name: `User ${uid}`,
        firebase: { sign_in_provider: "google.com" },
      },
    },
  } as CallableRequest<unknown>;
}

async function createTrip(currency = "MYR") {
  return createTripHandlerWithResolver(
    request("owner", {
      name: "Budget Trip",
      destinationPlaceId: "destination",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 0, lng: 0 },
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      primaryTransport: "WALKING",
      activityBudgetCurrency: currency,
    }),
    placeResolver
  );
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

describeEmulator("Budget Backend Integration", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-budget-test" });
  });

  it("SET and CLEAR in COLLECTING, solo and group ceiling calculation", async () => {
    const { tripId } = await createTrip();
    const db = getFirestore();

    // Solo OWNER sets budget
    const setRes = await setActivityBudgetHandler(
      request("owner", {
        tripId,
        expectedPlanningCycle: 1,
        amount: 250,
      })
    );
    expect(setRes).toEqual({
      safeActivityBudgetCeiling: 250,
      phase: "COLLECTING",
      planningCycle: 1,
      cleared: false,
    });

    let tripSnap = await db.collection("trips").doc(tripId).get();
    expect(tripSnap.data()?.safeActivityBudgetCeiling).toBe(250);

    // Solo OWNER clears budget
    const clearRes = await setActivityBudgetHandler(
      request("owner", {
        tripId,
        expectedPlanningCycle: 1,
        clear: true,
      })
    );
    expect(clearRes).toEqual({
      safeActivityBudgetCeiling: undefined,
      phase: "COLLECTING",
      planningCycle: 1,
      cleared: true,
    });

    tripSnap = await db.collection("trips").doc(tripId).get();
    expect(tripSnap.data()?.safeActivityBudgetCeiling).toBeUndefined();

    // Repeated CLEAR is idempotent and succeeds
    const clearRes2 = await setActivityBudgetHandler(
      request("owner", {
        tripId,
        expectedPlanningCycle: 1,
        clear: true,
      })
    );
    expect(clearRes2.cleared).toBe(true);

    // Add a second member to a new trip
    const tripData = await createTrip();
    const tripId2 = tripData.tripId;
    await joinTripHandler(request("member1", { tripId: tripId2, inviteToken: tripData.inviteToken }));

    // Group trip: member1 sets 300, owner sets 500 -> ceiling is 300
    await setActivityBudgetHandler(
      request("owner", { tripId: tripId2, expectedPlanningCycle: 1, amount: 500 })
    );
    const memberSet = await setActivityBudgetHandler(
      request("member1", { tripId: tripId2, expectedPlanningCycle: 1, amount: 300 })
    );
    expect(memberSet.safeActivityBudgetCeiling).toBe(300);

    // Missing member budgets impose no zero ceiling
    await setActivityBudgetHandler(
      request("member1", { tripId: tripId2, expectedPlanningCycle: 1, clear: true })
    );
    const tripSnap2 = await db.collection("trips").doc(tripId2).get();
    expect(tripSnap2.data()?.safeActivityBudgetCeiling).toBe(500);
  }, 20000);

  it("handles old-currency records and malformed budget handling", async () => {
    const { tripId } = await createTrip("USD");
    const db = getFirestore();

    // Directly seed an irrelevant old-currency record for a member (e.g. currency: "EUR")
    await db
      .collection("trips")
      .doc(tripId)
      .collection("members")
      .doc("member2")
      .set({ uid: "member2", role: "MEMBER", status: "ACTIVE" });
    await db.collection("trips").doc(tripId).update({ activeMemberCount: 2 });

    const oldCurrencyBudgetRef = db
      .collection("trips")
      .doc(tripId)
      .collection("activityBudgets")
      .doc("member2");
    await oldCurrencyBudgetRef.set({
      memberId: "member2",
      amount: 50,
      currency: "EUR",
      planningCycleUpdated: 1,
      updatedAt: Timestamp.now(),
    });

    // Owner sets budget in USD -> ceiling is owner's amount (old currency is ignored)
    const res = await setActivityBudgetHandler(
      request("owner", { tripId, expectedPlanningCycle: 1, amount: 200 })
    );
    expect(res.safeActivityBudgetCeiling).toBe(200);
    expect((await oldCurrencyBudgetRef.get()).data()).toMatchObject({
      memberId: "member2",
      amount: 50,
      currency: "EUR",
    });

    // Even if irrelevant old-currency record has a malformed field (e.g. amount: "bad"), it does not block recalculation
    await oldCurrencyBudgetRef.set({
      memberId: "member2",
      amount: "invalid-amount",
      currency: "EUR",
      planningCycleUpdated: 1,
      updatedAt: Timestamp.now(),
    });

    const res2 = await setActivityBudgetHandler(
      request("owner", { tripId, expectedPlanningCycle: 1, amount: 220 })
    );
    expect(res2.safeActivityBudgetCeiling).toBe(220);

    // But an applicable current-currency record with malformed field throws CONFLICT
    await oldCurrencyBudgetRef.set({
      memberId: "member2",
      amount: -10, // non-positive
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: Timestamp.now(),
    });

    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 250 }))
      )
    ).toBe("CONFLICT");

    // Unparseable currency / indeterminate applicability throws CONFLICT
    await oldCurrencyBudgetRef.set({
      memberId: "member2",
      amount: 100,
      currency: 12345, // invalid currency type
      planningCycleUpdated: 1,
      updatedAt: Timestamp.now(),
    });

    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 250 }))
      )
    ).toBe("CONFLICT");

    // memberId / docId mismatch throws CONFLICT
    await oldCurrencyBudgetRef.set({
      memberId: "different_uid",
      amount: 100,
      currency: "USD",
      planningCycleUpdated: 1,
      updatedAt: Timestamp.now(),
    });

    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 250 }))
      )
    ).toBe("CONFLICT");
  });

  it("handles legacy unsupported current currency: SET -> INVALID_INPUT, CLEAR -> allowed", async () => {
    const { tripId } = await createTrip();
    const db = getFirestore();

    // Simulate legacy persisted trip with unsupported currency
    await db.collection("trips").doc(tripId).update({ activityBudgetCurrency: "XYZ" });

    // SET is rejected
    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 100 }))
      )
    ).toBe("INVALID_INPUT");

    // CLEAR is allowed
    const clearRes = await setActivityBudgetHandler(
      request("owner", { tripId, expectedPlanningCycle: 1, clear: true })
    );
    expect(clearRes.cleared).toBe(true);
  });

  it("validates phase and membership authority guards", async () => {
    const { tripId } = await createTrip();
    const db = getFirestore();

    // Solo trip in VOTING is not allowed (solo cannot vote)
    await db.collection("trips").doc(tripId).update({ phase: "VOTING" });
    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 100 }))
      )
    ).toBe("INVALID_PHASE");

    // Phase in PLANNING is rejected
    await db.collection("trips").doc(tripId).update({ phase: "PLANNING" });
    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 100 }))
      )
    ).toBe("INVALID_PHASE");

    // Malformed ACTIVE-owner authority throws CONFLICT
    await db.collection("trips").doc(tripId).update({ phase: "COLLECTING", ownerId: "non_matching_owner" });
    expect(
      await reasonOf(() =>
        setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 100 }))
      )
    ).toBe("CONFLICT");
  });

  it("allows group Budget SET in VOTING", async () => {
    const tripData = await createTrip();
    await joinTripHandler(request("member1", { tripId: tripData.tripId, inviteToken: tripData.inviteToken }));
    await submitCandidateHandlerWithResolver(request("owner", {
      tripId: tripData.tripId,
      expectedPlanningCycle: 1,
      placeId: "voting-budget-place",
      preference: "INTERESTED",
      preferredPeriod: "ANYTIME",
      estimatedDurationMinutes: 60,
      durationSource: "USER_OVERRIDE",
    }), placeResolver);
    await startVotingHandler(request("owner", { tripId: tripData.tripId, expectedPlanningCycle: 1 }));

    const result = await setActivityBudgetHandler(
      request("member1", { tripId: tripData.tripId, expectedPlanningCycle: 1, amount: 175 })
    );
    expect(result).toMatchObject({ phase: "VOTING", planningCycle: 1, safeActivityBudgetCeiling: 175, cleared: false });
  });

  it("rejects direct Budget SET and CLEAR in REVIEW and FINALIZED", async () => {
    for (const phase of ["REVIEW", "FINALIZED"] as const) {
      const { tripId } = await createTrip();
      const db = getFirestore();
      await db.doc(`trips/${tripId}`).update({ phase });

      expect(await reasonOf(() => setActivityBudgetHandler(
        request("owner", { tripId, expectedPlanningCycle: 1, amount: 100 })
      ))).toBe("INVALID_PHASE");
      expect(await reasonOf(() => setActivityBudgetHandler(
        request("owner", { tripId, expectedPlanningCycle: 1, clear: true })
      ))).toBe("INVALID_PHASE");
    }
  });

  it("handles concurrent SET/SET and SET/CLEAR races cleanly", async () => {
    const tripData = await createTrip();
    const tripId = tripData.tripId;
    await joinTripHandler(request("member1", { tripId, inviteToken: tripData.inviteToken }));

    // Run parallel SETs
    const results = await Promise.allSettled([
      setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 400 })),
      setActivityBudgetHandler(request("member1", { tripId, expectedPlanningCycle: 1, amount: 350 })),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const db = getFirestore();
    const tripSnap = await db.collection("trips").doc(tripId).get();
    expect(tripSnap.data()?.safeActivityBudgetCeiling).toBe(350);

    // Parallel SET and CLEAR
    const results2 = await Promise.allSettled([
      setActivityBudgetHandler(request("member1", { tripId, expectedPlanningCycle: 1, clear: true })),
      setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 450 })),
    ]);
    expect(results2.every((r) => r.status === "fulfilled")).toBe(true);

    const tripSnap2 = await db.collection("trips").doc(tripId).get();
    expect(tripSnap2.data()?.safeActivityBudgetCeiling).toBe(450);
  }, 20000);

  it("keeps the ceiling consistent when membership removal races Budget SET", async () => {
    const tripData = await createTrip();
    const tripId = tripData.tripId;
    await joinTripHandler(request("member1", { tripId, inviteToken: tripData.inviteToken }));
    await setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 400 }));
    await setActivityBudgetHandler(request("member1", { tripId, expectedPlanningCycle: 1, amount: 50 }));

    const results = await Promise.allSettled([
      setActivityBudgetHandler(request("owner", { tripId, expectedPlanningCycle: 1, amount: 300 })),
      leaveTripHandler(request("member1", { tripId, expectedPlanningCycle: 1 })),
    ]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);

    const db = getFirestore();
    const trip = (await db.doc(`trips/${tripId}`).get()).data();
    const ownerBudget = (await db.doc(`trips/${tripId}/activityBudgets/owner`).get()).data();
    expect(trip).toMatchObject({ activeMemberCount: 1, membershipVersion: 3, phase: "COLLECTING", planningCycle: 1 });
    expect(trip?.safeActivityBudgetCeiling).toBe(ownerBudget?.amount);
  }, 30000);

  it("retries Budget SET against a currency change committed after its authority read", async () => {
    const { tripId } = await createTrip("MYR");
    const db = getFirestore();
    const tripRef = db.doc(`trips/${tripId}`);
    const budgetRef = db.doc(`trips/${tripId}/activityBudgets/owner`);

    let releaseFirstAttempt!: () => void;
    const firstAttemptMayContinue = new Promise<void>((resolve) => {
      releaseFirstAttempt = resolve;
    });
    let firstAuthorityRead!: () => void;
    const firstAuthorityReadObserved = new Promise<void>((resolve) => {
      firstAuthorityRead = resolve;
    });
    const observedCurrencies: string[] = [];

    const setPromise = setActivityBudgetHandler(
      request("owner", { tripId, expectedPlanningCycle: 1, amount: 125.5 }),
      {
        afterAuthorityRead: async ({ activityBudgetCurrency }) => {
          observedCurrencies.push(activityBudgetCurrency);
          if (observedCurrencies.length === 1) {
            firstAuthorityRead();
            await firstAttemptMayContinue;
          }
        },
      },
    );

    await firstAuthorityReadObserved;
    expect(observedCurrencies).toEqual(["MYR"]);

    // Commit a currency whose precision makes 125.5 invalid after the Budget transaction
    // has read MYR but before it can write. Firestore must retry the Budget transaction.
    await tripRef.update({ activityBudgetCurrency: "JPY" });
    releaseFirstAttempt();

    expect(await reasonOf(() => setPromise)).toBe("INVALID_INPUT");
    expect(observedCurrencies).toEqual(["MYR", "JPY"]);

    const trip = (await tripRef.get()).data();
    const budget = await budgetRef.get();
    expect(trip?.activityBudgetCurrency).toBe("JPY");
    expect(trip?.safeActivityBudgetCeiling).toBeUndefined();
    expect(budget.exists).toBe(false);
  }, 30000);
});
