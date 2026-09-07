import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { leaveTripHandler } from "../../functions/src/membership/leaveTrip";
import { removeMemberHandler } from "../../functions/src/membership/removeMember";
import { transferOwnershipHandler } from "../../functions/src/membership/transferOwnership";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const placeResolver: PlaceResolver = async placeId => ({
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
      token: { name: uid, firebase: { sign_in_provider: "google.com" } },
    },
  } as CallableRequest<unknown>;
}

async function createTrip() {
  return createTripHandlerWithResolver(request("owner", {
    name: "Trip",
    destinationPlaceId: "destination",
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "hint", lat: 0, lng: 0 },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
    primaryTransport: "WALKING",
    activityBudgetCurrency: "MYR",
  }), placeResolver);
}

async function joinMember(tripId: string, inviteToken: string, uid = "member") {
  return joinTripHandler(request(uid, { tripId, inviteToken }));
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

describeEmulator("Trip + Membership Part 2", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-part2-test" });
  });

  it("removes exactly once, re-derives count, preserves role, and retries idempotently", async () => {
    const created = await createTrip();
    await joinMember(created.tripId, created.inviteToken);
    const result = await removeMemberHandler(request("owner", { tripId: created.tripId, memberId: "member", expectedPlanningCycle: 1 }));
    expect(result).toMatchObject({ memberId: "member", changed: true, activeMemberCount: 1, membershipVersion: 3, phase: "COLLECTING", planningCycle: 1, workflowReopened: false, impactReasonCodes: ["GROUP_BECAME_SOLO"] });

    const db = getFirestore();
    expect((await db.doc(`trips/${created.tripId}/members/member`).get()).data()).toMatchObject({ role: "MEMBER", status: "REMOVED", removalKind: "OWNER_REMOVAL" });
    expect((await db.doc(`users/member/tripMemberships/${created.tripId}`).get()).data()).toMatchObject({ role: "MEMBER", status: "REMOVED" });
    const retry = await removeMemberHandler(request("owner", { tripId: created.tripId, memberId: "member", expectedPlanningCycle: 99 }));
    expect(retry).toMatchObject({ memberId: "member", changed: false, activeMemberCount: 1, membershipVersion: 3 });
  });

  it("recalculates the ceiling on a real join and preserves budgets and bookings on removal", async () => {
    const created = await createTrip();
    const db = getFirestore();
    const budget = { memberId: "owner", amount: 100, currency: "MYR", planningCycleUpdated: 1, updatedAt: new Date(0) };
    await db.doc(`trips/${created.tripId}/activityBudgets/owner`).set(budget);

    const joined = await joinMember(created.tripId, created.inviteToken);
    expect(joined).toMatchObject({ alreadyMember: false, activeMemberCount: 2 });
    expect((await db.doc(`trips/${created.tripId}`).get()).data()).toMatchObject({ safeActivityBudgetCeiling: 100 });
    const beforeRetry = (await db.doc(`trips/${created.tripId}`).get()).data();
    expect(await joinMember(created.tripId, created.inviteToken)).toMatchObject({ alreadyMember: true, activeMemberCount: 2 });
    expect((await db.doc(`trips/${created.tripId}`).get()).data()).toEqual(beforeRetry);

    await db.doc(`trips/${created.tripId}/activityBudgets/member`).set({ ...budget, memberId: "member", amount: 50 });
    const candidate = await submitCandidateHandlerWithResolver(request("member", {
      tripId: created.tripId,
      expectedPlanningCycle: 1,
      placeId: "booked-place",
      preference: "INTERESTED",
      preferredPeriod: "ANYTIME",
      estimatedDurationMinutes: 60,
      durationSource: "USER_OVERRIDE",
    }), placeResolver);
    const bookingBase = { candidateId: candidate.candidateId, memberId: "member", date: "2026-09-01", startTime: "10:00", endTime: "11:00" };
    await db.doc(`trips/${created.tripId}/fixedBookings/pending`).set({ ...bookingBase, status: "PENDING_CONFIRMATION" });
    await db.doc(`trips/${created.tripId}/fixedBookings/confirmed`).set({ ...bookingBase, status: "CONFIRMED" });

    await removeMemberHandler(request("owner", { tripId: created.tripId, memberId: "member", expectedPlanningCycle: 1 }));
    expect((await db.doc(`trips/${created.tripId}`).get()).data()).toMatchObject({ activeMemberCount: 1, safeActivityBudgetCeiling: 100 });
    expect((await db.doc(`trips/${created.tripId}/activityBudgets/member`).get()).data()).toMatchObject({ memberId: "member", amount: 50, currency: "MYR", planningCycleUpdated: 1 });
    expect((await db.doc(`trips/${created.tripId}/fixedBookings/pending`).get()).data()).toMatchObject({ status: "PENDING_CONFIRMATION" });
    expect((await db.doc(`trips/${created.tripId}/fixedBookings/confirmed`).get()).data()).toMatchObject({ status: "CONFIRMED" });
    expect((await db.doc(`trips/${created.tripId}/candidates/${candidate.candidateId}`).get()).data()).toMatchObject({ active: false });

  });

  it("stores an immutable self-leave receipt and uses it without reading later trip state", async () => {
    const created = await createTrip();
    await joinMember(created.tripId, created.inviteToken);
    const result = await leaveTripHandler(request("member", { tripId: created.tripId, expectedPlanningCycle: 1 }));
    expect(result).toMatchObject({ changed: true, activeMemberCount: 1, membershipVersion: 3, phase: "COLLECTING", planningCycle: 1 });

    const db = getFirestore();
    const memberRef = db.doc(`trips/${created.tripId}/members/member`);
    expect((await memberRef.get()).data()?.selfLeaveReceipt).toEqual({ activeMemberCount: 1, membershipVersion: 3, phase: "COLLECTING", planningCycle: 1 });
    expect((await db.doc(`users/member/tripMemberships/${created.tripId}`).get()).data()).not.toHaveProperty("selfLeaveReceipt");
    await db.doc(`trips/${created.tripId}`).update({ phase: "FINALIZED", planningCycle: 99 });
    expect(await leaveTripHandler(request("member", { tripId: created.tripId, expectedPlanningCycle: 99 }))).toMatchObject({ changed: false, activeMemberCount: 1, membershipVersion: 3, phase: "COLLECTING", planningCycle: 1, workflowReopened: false, impactReasonCodes: [] });
  });

  it("rejects owner removal and owner-leave loopholes", async () => {
    const created = await createTrip();
    expect(await reasonOf(() => removeMemberHandler(request("owner", { tripId: created.tripId, memberId: "owner", expectedPlanningCycle: 1 })))).toBe("CONFLICT");
    expect(await reasonOf(() => leaveTripHandler(request("owner", { tripId: created.tripId, expectedPlanningCycle: 1 })))).toBe("CONFLICT");

    await joinMember(created.tripId, created.inviteToken);
    await removeMemberHandler(request("owner", { tripId: created.tripId, memberId: "member", expectedPlanningCycle: 1 }));
    expect(await reasonOf(() => leaveTripHandler(request("member", { tripId: created.tripId, expectedPlanningCycle: 1 })))).toBe("MEMBER_INACTIVE");
  });

  it("reopens group-to-solo VOTING and transfers ownership without version changes", async () => {
    const created = await createTrip();
    await joinMember(created.tripId, created.inviteToken);
    const db = getFirestore();
    await db.doc(`trips/${created.tripId}`).update({ phase: "VOTING" });
    const left = await leaveTripHandler(request("member", { tripId: created.tripId, expectedPlanningCycle: 1 }));
    expect(left).toMatchObject({ phase: "COLLECTING", planningCycle: 2, workflowReopened: true, impactReasonCodes: ["GROUP_BECAME_SOLO"] });

    const second = await createTrip();
    await joinMember(second.tripId, second.inviteToken);
    const transferred = await transferOwnershipHandler(request("owner", { tripId: second.tripId, newOwnerId: "member" }));
    expect(transferred).toMatchObject({ previousOwnerId: "owner", ownerId: "member", changed: true, membershipVersion: 2 });
    expect(await transferOwnershipHandler(request("owner", { tripId: second.tripId, newOwnerId: "member" }))).toEqual({ previousOwnerId: "member", ownerId: "member", changed: false, membershipVersion: 2 });
    expect((await db.doc(`trips/${second.tripId}`).get()).data()).toMatchObject({ ownerId: "member", membershipVersion: 2, planningCycle: 1, activeMemberCount: 2 });
  });

  it("serializes removal versus self-leave and increments membershipVersion once", async () => {
    const created = await createTrip();
    await joinMember(created.tripId, created.inviteToken);
    const results = await Promise.allSettled([
      removeMemberHandler(request("owner", { tripId: created.tripId, memberId: "member", expectedPlanningCycle: 1 })),
      leaveTripHandler(request("member", { tripId: created.tripId, expectedPlanningCycle: 1 })),
    ]);
    expect(results.filter(result => result.status === "fulfilled" && result.value.changed === true)).toHaveLength(1);
    expect((await getFirestore().doc(`trips/${created.tripId}`).get()).data()).toMatchObject({ activeMemberCount: 1, membershipVersion: 3 });
  }, 30_000);

  it("serializes competing ownership transfers and preserves one owner", async () => {
    const created = await createTrip();
    await joinMember(created.tripId, created.inviteToken, "member");
    await joinMember(created.tripId, created.inviteToken, "member-2");
    const results = await Promise.allSettled([
      transferOwnershipHandler(request("owner", { tripId: created.tripId, newOwnerId: "member" })),
      transferOwnershipHandler(request("owner", { tripId: created.tripId, newOwnerId: "member-2" })),
    ]);
    expect(results.filter(result => result.status === "fulfilled" && result.value.changed === true)).toHaveLength(1);
    const db = getFirestore();
    const trip = (await db.doc(`trips/${created.tripId}`).get()).data();
    const activeOwners = (await db.collection(`trips/${created.tripId}/members`).where("status", "==", "ACTIVE").get()).docs.filter(doc => doc.data().role === "OWNER");
    expect(activeOwners).toHaveLength(1);
    expect(trip).toMatchObject({ membershipVersion: 3, planningCycle: 1 });
  }, 30_000);
});
