import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { createChangeRequestHandler } from "../../functions/src/changeRequests/createChangeRequest";
import { reviewChangeRequestHandler } from "../../functions/src/changeRequests/reviewChangeRequest";
import { applyChangeRequestHandler } from "../../functions/src/changeRequests/applyChangeRequest";
import { submitApprovalHandler } from "../../functions/src/review/submitApproval";
import { itineraryVersionDocumentSchema } from "@travel-planner/shared";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return {
    data,
    auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } },
  } as CallableRequest<unknown>;
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

interface SeedOptions {
  members?: Array<{ uid: string; role: "OWNER" | "MEMBER" }>;
  currency?: string;
  ownerBudget?: number;
  fixedBooking?: boolean;
}

async function seedFinalizedTrip(options: SeedOptions = {}) {
  const db = getFirestore();
  const members = options.members ?? [{ uid: "owner", role: "OWNER" as const }];
  const tripRef = db.collection("trips").doc();
  const now = Timestamp.now();
  const days = [{
    date: "2026-10-01",
    items: options.fixedBooking
      ? [{
          itemId: "fixed:booking-1",
          title: "Flight",
          date: "2026-10-01",
          startTime: "12:00",
          endTime: "13:00",
          durationMinutes: 60,
        }]
      : [],
  }];

  await tripRef.set({
    name: "Finalized change request trip",
    ownerId: "owner",
    phase: "FINALIZED",
    planningCycle: 1,
    membershipVersion: members.length,
    destination: { placeId: "destination", name: "Destination", lat: 3, lng: 101 },
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    timezone: "Asia/Kuala_Lumpur",
    baseLocation: { source: "USER_CONFIRMED", name: "Hotel", lat: 3, lng: 101 },
    defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
    dayOverrides: [],
    primaryTransport: "DRIVING",
    activityBudgetCurrency: options.currency ?? "MYR",
    activeMemberCount: members.length,
    ...(options.ownerBudget !== undefined ? { safeActivityBudgetCeiling: options.ownerBudget } : {}),
    currentItineraryVersionId: "version-1",
    createdAt: now,
    updatedAt: now,
  });

  for (const member of members) {
    await tripRef.collection("members").doc(member.uid).set({
      uid: member.uid,
      role: member.role,
      status: "ACTIVE",
    });
  }

  await tripRef.collection("itineraryVersions").doc("version-1").set({
    versionNumber: 1,
    source: "FINALIZATION",
    days,
    validationSnapshotId: "seed-validation",
    sourceReviewDraftRevision: 1,
    createdBy: "owner",
    createdAt: now,
  });

  if (options.ownerBudget !== undefined) {
    await tripRef.collection("activityBudgets").doc("owner").set({
      memberId: "owner",
      amount: options.ownerBudget,
      currency: options.currency ?? "MYR",
      planningCycleUpdated: 1,
      updatedAt: now,
    });
  }

  if (options.fixedBooking) {
    await tripRef.collection("fixedBookings").doc("booking-1").set({
      candidateId: "booking-candidate",
      date: "2026-10-01",
      startTime: "12:00",
      endTime: "13:00",
      durationMinutes: 60,
      status: "CONFIRMED",
      reportedBy: "owner",
      reportedAt: now,
      confirmedBy: "owner",
      confirmedAt: now,
    });
  }

  return tripRef;
}

describeEmulator("Change Request backend", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-change-request-test" });
  });

  it("applies solo budget changes as immutable versions and stales competing requests", async () => {
    const tripRef = await seedFinalizedTrip({ ownerBudget: 300 });
    const tripId = tripRef.id;

    const setRequest = await createChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: "version-1",
      change: { operation: "CHANGE_BUDGET", amount: 200 },
    }));
    const competing = await createChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: "version-1",
      change: { operation: "CHANGE_BUDGET", clear: true },
    }));
    expect(setRequest.classification).toBe("STRUCTURAL");
    expect(setRequest.approvalId).toBeUndefined();

    await reviewChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: "version-1",
      changeRequestId: setRequest.changeRequestId,
      decision: "PROCEED",
    }));
    await reviewChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: "version-1",
      changeRequestId: competing.changeRequestId,
      decision: "PROCEED",
    }));

    const beforeVersion = (await tripRef.collection("itineraryVersions").doc("version-1").get()).data();
    const applied = await applyChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: "version-1",
      changeRequestId: setRequest.changeRequestId,
    }));

    expect(applied.status).toBe("APPLIED");
    expect(applied.versionNumber).toBe(2);
    const trip = (await tripRef.get()).data()!;
    expect(trip.phase).toBe("FINALIZED");
    expect(trip.currentItineraryVersionId).toBe(applied.resultingVersionId);
    expect(trip.safeActivityBudgetCeiling).toBe(200);
    expect((await tripRef.collection("activityBudgets").doc("owner").get()).data()?.amount).toBe(200);
    expect((await tripRef.collection("itineraryVersions").doc("version-1").get()).data()).toEqual(beforeVersion);

    const nextVersion = itineraryVersionDocumentSchema.parse(
      (await tripRef.collection("itineraryVersions").doc(applied.resultingVersionId).get()).data(),
    );
    expect(nextVersion.source).toBe("CHANGE_REQUEST");
    expect(nextVersion.baseVersionId).toBe("version-1");
    expect(nextVersion.appliedChangeRequestId).toBe(setRequest.changeRequestId);
    expect((await tripRef.collection("changeRequests").doc(competing.changeRequestId).get()).data()?.status)
      .toBe("NEEDS_REVALIDATION");

    const clearRequest = await createChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: applied.resultingVersionId,
      change: { operation: "CHANGE_BUDGET", clear: true },
    }));
    await reviewChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: applied.resultingVersionId,
      changeRequestId: clearRequest.changeRequestId,
      decision: "PROCEED",
    }));
    await applyChangeRequestHandler(request("owner", {
      tripId,
      expectedItineraryVersionId: applied.resultingVersionId,
      changeRequestId: clearRequest.changeRequestId,
    }));
    expect((await tripRef.collection("activityBudgets").doc("owner").get()).exists).toBe(false);
    expect((await tripRef.get()).data()?.safeActivityBudgetCeiling).toBeUndefined();
  });

  it("allows CHANGE_BUDGET CLEAR for legacy stored currency without FX or canonicalization", async () => {
    const tripRef = await seedFinalizedTrip({ currency: "LEGACY", ownerBudget: 125 });
    const created = await createChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      change: { operation: "CHANGE_BUDGET", clear: true },
    }));
    await reviewChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
      decision: "PROCEED",
    }));
    await applyChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
    }));
    expect((await tripRef.collection("activityBudgets").doc("owner").get()).exists).toBe(false);
  });

  it("rejects stale client assumptions and marks an older request NEEDS_REVALIDATION without rebasing it", async () => {
    const tripRef = await seedFinalizedTrip();
    const created = await createChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      change: { operation: "CHANGE_BUDGET", clear: true },
    }));
    const now = Timestamp.now();
    await tripRef.collection("itineraryVersions").doc("version-2").set({
      versionNumber: 2,
      baseVersionId: "version-1",
      source: "CHANGE_REQUEST",
      days: [{ date: "2026-10-01", items: [] }],
      validationSnapshotId: "v2-validation",
      appliedChangeRequestId: "other-request",
      createdBy: "owner",
      createdAt: now,
    });
    await tripRef.update({ currentItineraryVersionId: "version-2", updatedAt: now });

    expect(await reasonOf(() => reviewChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
      decision: "PROCEED",
    })))).toBe("STALE_ITINERARY_VERSION");

    const result = await reviewChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-2",
      changeRequestId: created.changeRequestId,
      decision: "PROCEED",
    }));
    expect(result.status).toBe("NEEDS_REVALIDATION");
    const stored = (await tripRef.collection("changeRequests").doc(created.changeRequestId).get()).data()!;
    expect(stored.status).toBe("NEEDS_REVALIDATION");
    expect(stored.baseItineraryVersionId).toBe("version-1");
  });

  it("recalculates group structural majority against current ACTIVE membership", async () => {
    const tripRef = await seedFinalizedTrip({
      members: [
        { uid: "owner", role: "OWNER" },
        { uid: "member-1", role: "MEMBER" },
        { uid: "member-2", role: "MEMBER" },
      ],
      ownerBudget: 300,
    });
    const created = await createChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      change: { operation: "CHANGE_BUDGET", amount: 250 },
    }));
    expect(created.approvalId).toBeTruthy();
    await reviewChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
      decision: "PROCEED",
    }));

    expect(await reasonOf(() => applyChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
    })))).toBe("MAJORITY_REQUIRED");

    await submitApprovalHandler(request("owner", {
      tripId: tripRef.id,
      approvalId: created.approvalId,
      decision: "APPROVE",
    }));
    await submitApprovalHandler(request("member-1", {
      tripId: tripRef.id,
      approvalId: created.approvalId,
      decision: "APPROVE",
    }));

    await tripRef.collection("members").doc("member-3").set({ uid: "member-3", role: "MEMBER", status: "ACTIVE" });
    await tripRef.update({ membershipVersion: 4, activeMemberCount: 4, updatedAt: Timestamp.now() });
    expect(await reasonOf(() => applyChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
    })))).toBe("MAJORITY_REQUIRED");

    await submitApprovalHandler(request("member-3", {
      tripId: tripRef.id,
      approvalId: created.approvalId,
      decision: "APPROVE",
    }));
    const applied = await applyChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: created.changeRequestId,
    }));
    expect(applied.status).toBe("APPLIED");
  });

  it("fully replaces and then cancels a confirmed fixed booking only on successful application", async () => {
    const tripRef = await seedFinalizedTrip({ fixedBooking: true });
    const updateRequest = await createChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      change: {
        operation: "CHANGE_FIXED_BOOKING",
        action: "UPDATE",
        bookingId: "booking-1",
        date: "2026-10-01",
        startTime: "14:00",
        durationMinutes: 90,
      },
    }));
    expect((await tripRef.collection("fixedBookings").doc("booking-1").get()).data()?.startTime).toBe("12:00");
    await reviewChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: updateRequest.changeRequestId,
      decision: "PROCEED",
    }));
    expect((await tripRef.collection("fixedBookings").doc("booking-1").get()).data()?.startTime).toBe("12:00");
    const updated = await applyChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: "version-1",
      changeRequestId: updateRequest.changeRequestId,
    }));
    const booking = (await tripRef.collection("fixedBookings").doc("booking-1").get()).data()!;
    expect(booking.startTime).toBe("14:00");
    expect(booking.endTime).toBe("15:30");
    expect(booking.durationMinutes).toBe(90);
    const updatedVersion = itineraryVersionDocumentSchema.parse(
      (await tripRef.collection("itineraryVersions").doc(updated.resultingVersionId).get()).data(),
    );
    expect(updatedVersion.days[0].items[0].startTime).toBe("14:00");

    const cancelRequest = await createChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: updated.resultingVersionId,
      change: { operation: "CHANGE_FIXED_BOOKING", action: "CANCEL", bookingId: "booking-1", cancel: true },
    }));
    await reviewChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: updated.resultingVersionId,
      changeRequestId: cancelRequest.changeRequestId,
      decision: "PROCEED",
    }));
    expect((await tripRef.collection("fixedBookings").doc("booking-1").get()).exists).toBe(true);
    const cancelled = await applyChangeRequestHandler(request("owner", {
      tripId: tripRef.id,
      expectedItineraryVersionId: updated.resultingVersionId,
      changeRequestId: cancelRequest.changeRequestId,
    }));
    expect((await tripRef.collection("fixedBookings").doc("booking-1").get()).exists).toBe(false);
    const cancelledVersion = itineraryVersionDocumentSchema.parse(
      (await tripRef.collection("itineraryVersions").doc(cancelled.resultingVersionId).get()).data(),
    );
    expect(cancelledVersion.days[0].items).toHaveLength(0);
  });
});
