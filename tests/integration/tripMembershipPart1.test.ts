import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, beforeAll } from "vitest";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { resetInviteHandler } from "../../functions/src/membership/resetInvite";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";
import { hashInviteToken } from "../../functions/src/membership/inviteToken";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = runWithEmulator ? describe : describe.skip;

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
      token: {
        name: uid === "owner" ? "Owner" : `User ${uid}`,
        firebase: { sign_in_provider: "google.com" },
      },
    },
  } as CallableRequest<unknown>;
}

async function createTrip() {
  return createTripHandlerWithResolver(request("owner", {
    name: "Trip",
    destinationPlaceId: "destination",
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "client hint", lat: 0, lng: 0 },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
    primaryTransport: "WALKING",
    activityBudgetCurrency: "MYR",
  }), placeResolver);
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

describeEmulator("Trip + Membership Part 1", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-part1-test" });
  });

  it("creates the atomic owner, projection, invite, and normalized snapshots", async () => {
    const result = await createTrip();
    const db = getFirestore();
    const trip = await db.doc(`trips/${result.tripId}`).get();
    const member = await db.doc(`trips/${result.tripId}/members/owner`).get();
    const projection = await db.doc(`users/owner/tripMemberships/${result.tripId}`).get();
    const invite = await db.doc(`trips/${result.tripId}/private/invite`).get();
    const snapshots = await db.collection(`trips/${result.tripId}/externalSnapshots`).get();

    expect(trip.data()).toMatchObject({ phase: "COLLECTING", planningCycle: 1, membershipVersion: 1, activeMemberCount: 1 });
    expect(member.data()).toMatchObject({ uid: "owner", role: "OWNER", status: "ACTIVE" });
    expect(projection.data()).toMatchObject({ role: "OWNER", status: "ACTIVE", destinationName: "Destination" });
    expect(invite.data()).toMatchObject({ version: 1, tokenHash: hashInviteToken(result.inviteToken) });
    expect(invite.data()?.tokenHash).not.toBe(result.inviteToken);
    expect(snapshots.size).toBe(2);
    expect(trip.data()?.baseLocation).toMatchObject({ name: "Base", lat: 3.139, lng: 101.6869, source: "GOOGLE_PLACES" });
  });

  it("gives an ACTIVE retry precedence over malformed tokens and closed phases", async () => {
    const created = await createTrip();
    const db = getFirestore();
    await db.doc(`trips/${created.tripId}`).update({ phase: "FINALIZED" });

    const result = await joinTripHandler(request("owner", { tripId: created.tripId, inviteToken: "bad" }));
    expect(result).toMatchObject({ alreadyMember: true, role: "OWNER", phase: "FINALIZED", activeMemberCount: 1, membershipVersion: 1 });
  });

  it("persists USER_CONFIRMED base provenance and rejects invalid setup before writes", async () => {
    const result = await createTripHandlerWithResolver(request("owner", {
      name: "Confirmed base trip",
      destinationPlaceId: "destination",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      baseLocation: { source: "USER_CONFIRMED", name: "Hotel", lat: 3.14, lng: 101.69 },
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      primaryTransport: "WALKING",
      activityBudgetCurrency: "MYR",
    }), placeResolver);
    const db = getFirestore();
    const trip = await db.doc(`trips/${result.tripId}`).get();
    const snapshot = await db.doc(`trips/${result.tripId}/externalSnapshots/base-location`).get();

    expect(trip.data()?.baseLocation).toMatchObject({
      source: "USER_CONFIRMED",
      name: "Hotel",
      lat: 3.14,
      lng: 101.69,
    });
    expect(snapshot.exists).toBe(false);

    const invalid = await reasonOf(() => createTripHandlerWithResolver(request("owner", {
      name: "Invalid base trip",
      destinationPlaceId: "destination",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      baseLocation: { source: "USER_CONFIRMED", name: "Invalid", lat: 91, lng: 0 },
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      primaryTransport: "WALKING",
      activityBudgetCurrency: "MYR",
    }), placeResolver));
    expect(invalid).toBe("INVALID_INPUT");
  });

  it("joins a new member once and rejects a removed member before invite validation", async () => {
    const created = await createTrip();
    const joined = await joinTripHandler(request("member", { tripId: created.tripId, inviteToken: created.inviteToken }));
    expect(joined).toMatchObject({ alreadyMember: false, role: "MEMBER", activeMemberCount: 2, membershipVersion: 2 });

    const retry = await joinTripHandler(request("member", { tripId: created.tripId, inviteToken: "malformed" }));
    expect(retry).toMatchObject({ alreadyMember: true, activeMemberCount: 2, membershipVersion: 2 });

    const db = getFirestore();
    await db.doc(`trips/${created.tripId}/members/removed`).set({ uid: "removed", displayName: "Removed", role: "MEMBER", status: "REMOVED", joinedAt: new Date() });
    expect(await reasonOf(() => joinTripHandler(request("removed", { tripId: created.tripId, inviteToken: created.inviteToken })))).toBe("MEMBER_INACTIVE");
  });

  it("rejects malformed input for a new member without changing membership state", async () => {
    const created = await createTrip();
    const db = getFirestore();

    expect(await reasonOf(() => joinTripHandler(request("new-member", { tripId: created.tripId, inviteToken: "bad" })))).toBe("INVALID_INPUT");
    expect((await db.doc(`trips/${created.tripId}/members/new-member`).get()).exists).toBe(false);
    expect((await db.doc(`trips/${created.tripId}`).get()).data()).toMatchObject({ activeMemberCount: 1, membershipVersion: 1 });
  });

  it("rotates invites without changing membership state and invalidates old tokens", async () => {
    const created = await createTrip();
    const reset = await resetInviteHandler(request("owner", { tripId: created.tripId }));
    expect(reset.inviteVersion).toBe(2);
    expect(await reasonOf(() => joinTripHandler(request("member", { tripId: created.tripId, inviteToken: created.inviteToken })))).toBe("INVITE_RESET");
    const joined = await joinTripHandler(request("member", { tripId: created.tripId, inviteToken: reset.inviteToken }));
    expect(joined).toMatchObject({ activeMemberCount: 2, membershipVersion: 2 });
    const trip = await getFirestore().doc(`trips/${created.tripId}`).get();
    expect(trip.data()).toMatchObject({ activeMemberCount: 2, membershipVersion: 2, planningCycle: 1 });
  });

  it("serializes two joins for the final slot", async () => {
    const created = await createTrip();
    for (let i = 1; i <= 6; i += 1) {
      await joinTripHandler(request(`member-${i}`, { tripId: created.tripId, inviteToken: created.inviteToken }));
    }
    const results = await Promise.allSettled([
      joinTripHandler(request("member-7", { tripId: created.tripId, inviteToken: created.inviteToken })),
      joinTripHandler(request("member-8", { tripId: created.tripId, inviteToken: created.inviteToken })),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected").map(result => result.reason.details?.reason)).toEqual(["LIMIT_EXCEEDED"]);
    const trip = await getFirestore().doc(`trips/${created.tripId}`).get();
    expect(trip.data()?.activeMemberCount).toBe(8);
    expect(trip.data()?.membershipVersion).toBe(8);
  }, 30_000);

  it("serializes resetInvite and joinTrip using the current token", async () => {
    const created = await createTrip();
    const db = getFirestore();
    const [joinResult, resetResult] = await Promise.allSettled([
      joinTripHandler(request("concurrent-member", { tripId: created.tripId, inviteToken: created.inviteToken })),
      resetInviteHandler(request("owner", { tripId: created.tripId })),
    ]);

    expect(resetResult.status).toBe("fulfilled");
    expect(resetResult.status === "fulfilled" && resetResult.value.inviteVersion).toBe(2);
    const joinSucceeded = joinResult.status === "fulfilled";
    if (!joinSucceeded) {
      expect((joinResult.reason as { details?: { reason?: string } }).details?.reason).toBe("INVITE_RESET");
    }

    const trip = (await db.doc(`trips/${created.tripId}`).get()).data();
    const invite = (await db.doc(`trips/${created.tripId}/private/invite`).get()).data();
    const activeMembers = await db.collection(`trips/${created.tripId}/members`).where("status", "==", "ACTIVE").get();
    const member = await db.doc(`trips/${created.tripId}/members/concurrent-member`).get();
    const projection = await db.doc(`users/concurrent-member/tripMemberships/${created.tripId}`).get();

    expect(activeMembers.size).toBe(trip?.activeMemberCount);
    expect(trip?.membershipVersion).toBe(joinSucceeded ? 2 : 1);
    expect(invite?.version).toBe(2);
    expect(member.exists).toBe(joinSucceeded);
    expect(projection.exists).toBe(joinSucceeded);
  });
});