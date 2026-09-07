import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "vitest";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = runWithEmulator ? describe : describe.skip;

const projectId = "travel-planner-security-test";
let env: RulesTestEnvironment;

const tripId = "trip-1";
const ownerUid = "owner";
const memberUid = "member";
const otherUid = "other";
const removedUid = "removed";

beforeAll(async () => {
  if (!runWithEmulator) return;
  const rules = fs.readFileSync(
    path.resolve(process.cwd(), "firebase/firestore.rules"),
    "utf8",
  );

  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

afterAll(async () => {
  if (env) {
    await env.cleanup();
  }
});

beforeEach(async () => {
  if (!runWithEmulator) return;
  await env.clearFirestore();


  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "users", memberUid), {
      uid: memberUid,
      displayName: "Member",
    });

    await setDoc(
      doc(db, "users", memberUid, "tripMemberships", tripId),
      { tripId, status: "ACTIVE" },
    );

    await setDoc(doc(db, "trips", tripId), {
      ownerId: ownerUid,
      phase: "VOTING",
      planningCycle: 1,
      safeActivityBudgetCeiling: 100,
    });

    for (const [uid, role, status] of [
      [ownerUid, "OWNER", "ACTIVE"],
      [memberUid, "MEMBER", "ACTIVE"],
      [removedUid, "MEMBER", "REMOVED"],
    ] as const) {
      await setDoc(doc(db, "trips", tripId, "members", uid), {
        uid,
        role,
        status,
      });
    }

    await setDoc(
      doc(db, "trips", tripId, "activityBudgets", memberUid),
      { memberId: memberUid, amount: 100 },
    );

    await setDoc(
      doc(db, "trips", tripId, "activityBudgets", ownerUid),
      { memberId: ownerUid, amount: 150 },
    );

    await setDoc(
      doc(db, "trips", tripId, "fixedBookings", "booking-1"),
      { candidateId: "candidate-1", status: "CONFIRMED" },
    );


    await setDoc(
      doc(
        db,
        "trips",
        tripId,
        "candidateVotes",
        `1_candidate-1_${memberUid}`,
      ),
      { memberId: memberUid, candidateId: "candidate-1", value: "WANT", planningCycle: 1 },
    );

    await setDoc(
      doc(
        db,
        "trips",
        tripId,
        "candidateVotes",
        `0_candidate-1_${memberUid}`,
      ),
      { memberId: memberUid, candidateId: "candidate-1", value: "AVOID", planningCycle: 0 },
    );

    await setDoc(
      doc(db, "trips", tripId, "candidateVotes", "opaque-vote-id"),
      { memberId: memberUid, candidateId: "candidate-1", value: "NEUTRAL", planningCycle: 1 },
    );

    await setDoc(
      doc(db, "trips", tripId, "candidateVotes", `misleading-${memberUid}`),
      { memberId: ownerUid, candidateId: "candidate-1", value: "WANT", planningCycle: 1 },
    );

    await setDoc(
      doc(db, "trips", tripId, "candidateVotes", `1_candidate-1_${removedUid}`),
      { memberId: removedUid, candidateId: "candidate-1", value: "WANT", planningCycle: 1 },
    );

    await setDoc(
      doc(db, "trips", tripId, "optionVotes", ownerUid),
      { memberId: ownerUid, optionId: "option-1", planningCycle: 1 },
    );
    await setDoc(
      doc(db, "trips", tripId, "optionVotes", removedUid),
      { memberId: removedUid, optionId: "option-1", planningCycle: 1 },
    );

    await setDoc(
      doc(db, "trips", tripId, "candidates", "candidate-1"),
      { placeId: "google-place", active: true },
    );
    await setDoc(
      doc(db, "trips", tripId, "submissions", `${memberUid}_candidate-1`),
      { memberId: memberUid, candidateId: "candidate-1", preference: "INTERESTED" },
    );

    await setDoc(
      doc(db, "trips", tripId, "optionVotes", memberUid),
      { memberId: memberUid, optionId: "option-1", planningCycle: 1 },
    );

    await setDoc(
      doc(db, "trips", tripId, "approvals", "approval-1"),
      { yesCount: 1, noCount: 0, status: "PENDING" },
    );

    await setDoc(
      doc(
        db,
        "trips",
        tripId,
        "approvals",
        "approval-1",
        "responses",
        memberUid,
      ),
      { memberId: memberUid, decision: "APPROVE" },
    );

    await setDoc(
      doc(db, "trips", tripId, "criticalFactProposals", "fact-1"),
      { candidateId: "candidate-1", status: "PENDING" },
    );

    await setDoc(
      doc(db, "trips", tripId, "validationSnapshots", "validation-1"),
      { result: "VALID", schedulable: true },
    );

    await setDoc(
      doc(db, "trips", tripId, "private", "invite"),
      { tokenHash: "never-client-readable" },
    );

    await setDoc(
      doc(db, "trips", tripId, "externalSnapshots", "external-1"),
      { provider: "GOOGLE_PLACES" },
    );
  });
});

describeEmulator("shared trip reads", () => {
  it("allows an ACTIVE member to read the trip", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertSucceeds(getDoc(doc(db, "trips", tripId)));
  });

  it("denies a non-member", async () => {
    const db = env.authenticatedContext(otherUid).firestore();
    await assertFails(getDoc(doc(db, "trips", tripId)));
  });

  it("denies a REMOVED member", async () => {
    const db = env.authenticatedContext(removedUid).firestore();
    await assertFails(getDoc(doc(db, "trips", tripId)));
  });

  it("denies unauthenticated reads", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "trips", tripId)));
  });

  it("allows ACTIVE members to read candidates and submissions", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertSucceeds(getDoc(doc(db, "trips", tripId, "candidates", "candidate-1")));
    await assertSucceeds(getDoc(doc(db, "trips", tripId, "submissions", `${memberUid}_candidate-1`)));
  });

  it("denies removed members and non-members candidate/submission reads", async () => {
    const removedDb = env.authenticatedContext(removedUid).firestore();
    const otherDb = env.authenticatedContext(otherUid).firestore();
    for (const db of [removedDb, otherDb]) {
      await assertFails(getDoc(doc(db, "trips", tripId, "candidates", "candidate-1")));
      await assertFails(getDoc(doc(db, "trips", tripId, "submissions", `${memberUid}_candidate-1`)));
    }
  });
});

describeEmulator("self-only state", () => {
  it("allows own user profile and own trip projection", async () => {
    const db = env.authenticatedContext(memberUid).firestore();

    await assertSucceeds(getDoc(doc(db, "users", memberUid)));
    await assertSucceeds(
      getDoc(doc(db, "users", memberUid, "tripMemberships", tripId)),
    );
  });

  it("denies another user's profile", async () => {
    const db = env.authenticatedContext(ownerUid).firestore();
    await assertFails(getDoc(doc(db, "users", memberUid)));
  });

  it("allows own budget but denies another member budget", async () => {
    const db = env.authenticatedContext(memberUid).firestore();

    await assertSucceeds(
      getDoc(doc(db, "trips", tripId, "activityBudgets", memberUid)),
    );
    await assertFails(
      getDoc(doc(db, "trips", tripId, "activityBudgets", ownerUid)),
    );
  });

  it("denies budget list and collection queries", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertFails(getDocs(collection(db, "trips", tripId, "activityBudgets")));
  });

  it("allows ACTIVE member to read fixed bookings (get + list) and denies others", async () => {
    const memberDb = env.authenticatedContext(memberUid).firestore();
    await assertSucceeds(getDoc(doc(memberDb, "trips", tripId, "fixedBookings", "booking-1")));
    await assertSucceeds(getDocs(collection(memberDb, "trips", tripId, "fixedBookings")));

    const nonMemberDb = env.authenticatedContext(otherUid).firestore();
    await assertFails(getDoc(doc(nonMemberDb, "trips", tripId, "fixedBookings", "booking-1")));
    await assertFails(getDocs(collection(nonMemberDb, "trips", tripId, "fixedBookings")));

    const removedDb = env.authenticatedContext(removedUid).firestore();
    await assertFails(getDoc(doc(removedDb, "trips", tripId, "fixedBookings", "booking-1")));
    await assertFails(getDocs(collection(removedDb, "trips", tripId, "fixedBookings")));
  });


  it("allows own option vote and approval response", async () => {
    const db = env.authenticatedContext(memberUid).firestore();

    await assertSucceeds(
      getDoc(doc(db, "trips", tripId, "optionVotes", memberUid)),
    );

    await assertSucceeds(
      getDoc(
        doc(
          db,
          "trips",
          tripId,
          "approvals",
          "approval-1",
          "responses",
          memberUid,
        ),
      ),
    );
  });
});

describeEmulator("voting privacy", () => {
  it("allows an ACTIVE member to exact-get current, historical, and opaque candidate votes", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    for (const id of ["1_candidate-1_member", "0_candidate-1_member", "opaque-vote-id"]) {
      await assertSucceeds(getDoc(doc(db, "trips", tripId, "candidateVotes", id)));
    }
  });

  it("does not authorize a misleading candidate vote ID", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertFails(getDoc(doc(db, "trips", tripId, "candidateVotes", `misleading-${memberUid}`)));
  });

  it("denies candidate votes to other ACTIVE members, REMOVED members, non-members, and unauthenticated users", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext(ownerUid).firestore(), "trips", tripId, "candidateVotes", "1_candidate-1_member")));
    await assertFails(getDoc(doc(env.authenticatedContext(removedUid).firestore(), "trips", tripId, "candidateVotes", `1_candidate-1_${removedUid}`)));
    await assertFails(getDoc(doc(env.authenticatedContext(otherUid).firestore(), "trips", tripId, "candidateVotes", "1_candidate-1_member")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "trips", tripId, "candidateVotes", "1_candidate-1_member")));
  });

  it("denies candidate vote list and queries", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertFails(getDocs(collection(db, "trips", tripId, "candidateVotes")));
    await assertFails(getDocs(query(collection(db, "trips", tripId, "candidateVotes"), where("memberId", "==", memberUid))));
  });

  it("allows only an ACTIVE member to exact-get their option vote", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertSucceeds(getDoc(doc(db, "trips", tripId, "optionVotes", memberUid)));
    await assertFails(getDoc(doc(db, "trips", tripId, "optionVotes", ownerUid)));
    await assertFails(getDoc(doc(env.authenticatedContext(removedUid).firestore(), "trips", tripId, "optionVotes", removedUid)));
    await assertFails(getDoc(doc(env.authenticatedContext(otherUid).firestore(), "trips", tripId, "optionVotes", memberUid)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "trips", tripId, "optionVotes", memberUid)));
  });

  it("denies option vote list and queries", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertFails(getDocs(collection(db, "trips", tripId, "optionVotes")));
    await assertFails(getDocs(query(collection(db, "trips", tripId, "optionVotes"), where("memberId", "==", memberUid))));
  });

  it("denies direct candidateVotes create, update, and delete", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    const ref = doc(db, "trips", tripId, "candidateVotes", "browser-candidate-write");
    await assertFails(setDoc(ref, { memberId: memberUid }));
    await assertFails(updateDoc(doc(db, "trips", tripId, "candidateVotes", "1_candidate-1_member"), { value: "AVOID" }));
    await assertFails(deleteDoc(doc(db, "trips", tripId, "candidateVotes", "1_candidate-1_member")));
  });

  it("denies direct optionVotes create, update, and delete", async () => {
    const db = env.authenticatedContext(memberUid).firestore();
    await assertFails(setDoc(doc(db, "trips", tripId, "optionVotes", "browser-option-write"), { memberId: memberUid }));
    await assertFails(updateDoc(doc(db, "trips", tripId, "optionVotes", memberUid), { optionId: "option-2" }));
    await assertFails(deleteDoc(doc(db, "trips", tripId, "optionVotes", memberUid)));
  });
});

describeEmulator("shared normalized state", () => {
  it("allows active members to read critical fact and validation state", async () => {
    const db = env.authenticatedContext(memberUid).firestore();

    await assertSucceeds(
      getDoc(
        doc(db, "trips", tripId, "criticalFactProposals", "fact-1"),
      ),
    );

    await assertSucceeds(
      getDoc(
        doc(db, "trips", tripId, "validationSnapshots", "validation-1"),
      ),
    );
  });
});

describeEmulator("server-only state", () => {
  it("denies private invite and external snapshots", async () => {
    const db = env.authenticatedContext(ownerUid).firestore();

    await assertFails(
      getDoc(doc(db, "trips", tripId, "private", "invite")),
    );

    await assertFails(
      getDoc(
        doc(db, "trips", tripId, "externalSnapshots", "external-1"),
      ),
    );
  });
});

describeEmulator("direct writes", () => {
  it("denies browser writes even for an OWNER", async () => {
    const db = env.authenticatedContext(ownerUid).firestore();

    await assertFails(
      setDoc(doc(db, "trips", tripId, "candidates", "candidate-2"), {
        placeId: "google-place",
      }),
    );

    await assertFails(
      setDoc(
        doc(db, "trips", tripId, "candidateVotes", `candidate-1_${ownerUid}`),
        { memberId: ownerUid, value: "WANT" },
      ),
    );
  });

  it("denies direct writes to every application-domain collection", async () => {
    const db = env.authenticatedContext(ownerUid).firestore();
    const refs = [
      doc(db, "trips", tripId),
      doc(db, "trips", tripId, "members", ownerUid),
      doc(db, "trips", tripId, "candidates", "candidate-2"),
      doc(db, "trips", tripId, "submissions", "submission-2"),
      doc(db, "trips", tripId, "candidateVotes", "candidate-2_owner"),
      doc(db, "trips", tripId, "activityBudgets", ownerUid),
      doc(db, "trips", tripId, "fixedBookings", "booking-2"),
      doc(db, "trips", tripId, "validationSnapshots", "validation-2"),
      doc(db, "trips", tripId, "itineraryOptions", "option-2"),
      doc(db, "trips", tripId, "optionVotes", ownerUid),
      doc(db, "trips", tripId, "reviewDrafts", "1"),
      doc(db, "trips", tripId, "approvals", "approval-2"),
      doc(db, "trips", tripId, "approvals", "approval-2", "responses", ownerUid),
      doc(db, "trips", tripId, "itineraryVersions", "version-2"),
      doc(db, "trips", tripId, "changeRequests", "change-2"),
      doc(db, "trips", tripId, "backupCandidates", "backup-2"),
      doc(db, "trips", tripId, "externalSnapshots", "external-2"),
    ];

    for (const ref of refs) {
      await assertFails(setDoc(ref, { attempted: true }));
    }

    // Direct update and delete denials for activityBudgets and fixedBookings
    await assertFails(updateDoc(doc(db, "trips", tripId, "activityBudgets", ownerUid), { amount: 999 }));
    await assertFails(deleteDoc(doc(db, "trips", tripId, "activityBudgets", ownerUid)));
    await assertFails(updateDoc(doc(db, "trips", tripId, "fixedBookings", "booking-1"), { status: "CONFIRMED" }));
    await assertFails(deleteDoc(doc(db, "trips", tripId, "fixedBookings", "booking-1")));
  });
});
