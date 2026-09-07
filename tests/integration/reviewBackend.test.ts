import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeAll, describe, expect, it } from "vitest";
import { selectWinningOptionHandler } from "../../functions/src/review/selectWinningOption";
import { castOptionVoteHandler } from "../../functions/src/voting/castOptionVote";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

function request(uid: string, data: unknown): CallableRequest<unknown> {
  return { data, auth: { uid, token: { name: uid, firebase: { sign_in_provider: "google.com" } } } } as CallableRequest<unknown>;
}

function optionDocument(optionId: string) {
  return {
    planningCycle: 1,
    variant: optionId === "option-1" ? "BALANCED" : "LESS_TRAVEL",
    days: [{
      date: "2026-09-01",
      items: [{
        itemId: `${optionId}-item`,
        candidateId: `${optionId}-candidate`,
        title: `Activity ${optionId}`,
        date: "2026-09-01",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: 60,
      }],
    }],
    score: {
      mustDo: 0,
      votePreference: 0,
      travelEfficiency: 0,
      gapEfficiency: 0,
      budgetEfficiency: 0,
      preferredPeriod: 0,
    },
    validationSnapshotId: `${optionId}-validation`,
    createdAt: Timestamp.now(),
  };
}

async function seedPlanningTrip(memberIds: string[]) {
  const db = getFirestore();
  const tripRef = db.collection("trips").doc();
  const activeIds = ["owner", ...memberIds];
  await tripRef.set({
    ownerId: "owner",
    phase: "PLANNING",
    planningCycle: 1,
    membershipVersion: activeIds.length,
    activeMemberCount: activeIds.length,
    updatedAt: Timestamp.now(),
  });
  await tripRef.collection("members").doc("owner").set({ uid: "owner", role: "OWNER", status: "ACTIVE" });
  for (const uid of memberIds) {
    await tripRef.collection("members").doc(uid).set({ uid, role: "MEMBER", status: "ACTIVE" });
  }
  await tripRef.collection("itineraryOptions").doc("option-1").set(optionDocument("option-1"));
  await tripRef.collection("itineraryOptions").doc("option-2").set(optionDocument("option-2"));
  return tripRef;
}

async function seedVote(tripId: string, memberId: string, optionId: string, planningCycle = 1) {
  await getFirestore().doc(`trips/${tripId}/optionVotes/${memberId}`).set({
    memberId,
    planningCycle,
    optionId,
    updatedAt: Timestamp.now(),
  });
}

async function reasonOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason;
  }
  return undefined;
}

describeEmulator("Review backend selectWinningOption", () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-review-test" });
  });

  it("recalculates the group winner from current ACTIVE-member votes and enters REVIEW atomically", async () => {
    const tripRef = await seedPlanningTrip(["member", "member-2", "removed"]);
    await tripRef.collection("members").doc("removed").update({ status: "REMOVED" });
    await tripRef.update({ activeMemberCount: 3, membershipVersion: 5 });
    await seedVote(tripRef.id, "owner", "option-1");
    await seedVote(tripRef.id, "member", "option-1");
    await seedVote(tripRef.id, "member-2", "option-2");
    await seedVote(tripRef.id, "removed", "option-2");
    await seedVote(tripRef.id, "stale-member", "option-2", 2);

    const result = await selectWinningOptionHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
    }));

    expect(result).toMatchObject({
      selectedOptionId: "option-1",
      reviewDraftRevision: 1,
      phase: "REVIEW",
    });
    expect(result.approvalId).toBeTruthy();
    expect(result.tieBroken).toBeUndefined();

    const [trip, draft, option, approval] = await Promise.all([
      tripRef.get(),
      tripRef.collection("reviewDrafts").doc("1").get(),
      tripRef.collection("itineraryOptions").doc("option-1").get(),
      tripRef.collection("approvals").doc(result.approvalId!).get(),
    ]);
    expect(trip.data()).toMatchObject({ phase: "REVIEW", selectedOptionId: "option-1", planningCycle: 1 });
    expect(draft.data()).toMatchObject({
      planningCycle: 1,
      sourceOptionId: "option-1",
      revision: 1,
      validationSnapshotId: "option-1-validation",
      days: option.data()?.days,
      updatedBy: "owner",
    });
    expect(approval.data()).toMatchObject({
      type: "FINAL_ITINERARY",
      planningCycle: 1,
      subjectType: "REVIEW_DRAFT",
      subjectId: "1",
      subjectRevision: 1,
      status: "PENDING",
      yesCount: 0,
      noCount: 0,
      createdBy: "owner",
    });
  });

  it("requires a true top-set tie-break and accepts only a tied option", async () => {
    const tripRef = await seedPlanningTrip(["member"]);
    await seedVote(tripRef.id, "owner", "option-1");
    await seedVote(tripRef.id, "member", "option-2");

    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
    })))).toBe("CONFLICT");
    expect((await tripRef.get()).data()?.phase).toBe("PLANNING");
    expect((await tripRef.collection("reviewDrafts").get()).empty).toBe(true);
    expect((await tripRef.collection("approvals").get()).empty).toBe(true);

    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
      tieBreakOptionId: "not-tied",
    })))).toBe("INVALID_INPUT");

    const result = await selectWinningOptionHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
      tieBreakOptionId: "option-2",
    }));
    expect(result).toMatchObject({ selectedOptionId: "option-2", phase: "REVIEW", tieBroken: true });
  });

  it("rejects group selection when there are zero current valid option votes", async () => {
    const tripRef = await seedPlanningTrip(["member"]);
    await seedVote(tripRef.id, "member", "option-1", 2);
    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
    })))).toBe("NO_OPTION_VOTES");
    expect((await tripRef.get()).data()?.phase).toBe("PLANNING");
  });

  it("lets a solo OWNER select a current option and creates no group approval", async () => {
    const tripRef = await seedPlanningTrip([]);
    const result = await selectWinningOptionHandler(request("owner", {
      tripId: tripRef.id,
      expectedPlanningCycle: 1,
      selectedOptionId: "option-2",
    }));

    expect(result).toEqual({
      selectedOptionId: "option-2",
      reviewDraftRevision: 1,
      phase: "REVIEW",
    });
    expect((await tripRef.collection("approvals").get()).empty).toBe(true);
    expect((await tripRef.collection("optionVotes").get()).empty).toBe(true);
    expect((await tripRef.collection("reviewDrafts").doc("1").get()).data()).toMatchObject({
      sourceOptionId: "option-2",
      validationSnapshotId: "option-2-validation",
      revision: 1,
    });
  });

  it("enforces OWNER, phase, cycle, and solo/group input authority", async () => {
    const groupRef = await seedPlanningTrip(["member"]);
    await seedVote(groupRef.id, "owner", "option-1");
    expect(await reasonOf(() => selectWinningOptionHandler(request("member", {
      tripId: groupRef.id,
      expectedPlanningCycle: 1,
    })))).toBe("OWNER_REQUIRED");
    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: groupRef.id,
      expectedPlanningCycle: 2,
    })))).toBe("STALE_PLANNING_CYCLE");
    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: groupRef.id,
      expectedPlanningCycle: 1,
      selectedOptionId: "option-1",
    })))).toBe("INVALID_INPUT");

    await groupRef.update({ phase: "REVIEW" });
    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: groupRef.id,
      expectedPlanningCycle: 1,
    })))).toBe("INVALID_PHASE");

    const soloRef = await seedPlanningTrip([]);
    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: soloRef.id,
      expectedPlanningCycle: 1,
    })))).toBe("INVALID_INPUT");
    expect(await reasonOf(() => selectWinningOptionHandler(request("owner", {
      tripId: soloRef.id,
      expectedPlanningCycle: 1,
      selectedOptionId: "missing-option",
    })))).toBe("NOT_FOUND");
  });

  it("serializes a concurrent final option vote against selection without mixed authority", async () => {
    const tripRef = await seedPlanningTrip(["member", "member-2"]);
    await seedVote(tripRef.id, "owner", "option-1");
    await seedVote(tripRef.id, "member", "option-2");

    const results = await Promise.allSettled([
      castOptionVoteHandler(request("member-2", {
        tripId: tripRef.id,
        expectedPlanningCycle: 1,
        optionId: "option-2",
      })),
      selectWinningOptionHandler(request("owner", {
        tripId: tripRef.id,
        expectedPlanningCycle: 1,
        tieBreakOptionId: "option-1",
      })),
    ]);

    const storedTrip = (await tripRef.get()).data();
    if (storedTrip?.phase === "REVIEW") {
      expect(storedTrip.selectedOptionId).toBe("option-1");
      expect(results[1].status).toBe("fulfilled");
      if (results[0].status === "rejected") {
        expect((results[0].reason as { details?: { reason?: string } }).details?.reason).toBe("INVALID_PHASE");
      }
    } else {
      expect(storedTrip?.phase).toBe("PLANNING");
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ details: { reason: "INVALID_INPUT" } });
      expect((await tripRef.collection("reviewDrafts").get()).empty).toBe(true);
    }
  }, 30_000);
});
