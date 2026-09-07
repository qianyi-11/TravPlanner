import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, beforeAll } from "vitest";
import { reportFixedBookingHandler } from "../../functions/src/bookings/reportFixedBooking";
import { confirmFixedBookingHandler } from "../../functions/src/bookings/confirmFixedBooking";
import { changeFixedBookingHandler } from "../../functions/src/bookings/changeFixedBooking";
import { createTripHandlerWithResolver } from "../../functions/src/trips/createTrip";
import { submitCandidateHandlerWithResolver } from "../../functions/src/candidates/submitCandidate";
import { joinTripHandler } from "../../functions/src/membership/joinTrip";
import { removeMemberHandler } from "../../functions/src/membership/removeMember";
import { transferOwnershipHandler } from "../../functions/src/membership/transferOwnership";
import { reopenTripPhaseHandler } from "../../functions/src/trips/reopenTripPhase";
import { startVotingHandler } from "../../functions/src/voting/startVoting";
import { candidateIdFromPlaceId } from "../../functions/src/candidates/candidateIdentity";
import type { PlaceResolver } from "../../functions/src/integrations/google/places";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = runWithEmulator ? describe : describe.skip;

const placeResolver: PlaceResolver = async (placeId) => ({
  placeId,
  name: placeId === "destination" ? "Destination" : `Place ${placeId}`,
  lat: 3.139,
  lng: 101.6869,
  timezone: "Asia/Kuala_Lumpur",
  placeTypes: ["tourist_attraction"],
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

async function createTrip() {
  return createTripHandlerWithResolver(
    request("owner", {
      name: "Booking Trip",
      destinationPlaceId: "destination",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      baseLocation: { source: "GOOGLE_PLACES", placeId: "base", name: "Base", lat: 0, lng: 0 },
      defaultDayWindow: { startTime: "09:00", endTime: "18:00" },
      primaryTransport: "WALKING",
      activityBudgetCurrency: "MYR",
    }),
    placeResolver
  );
}

async function submitCandidate(uid: string, tripId: string, placeId: string) {
  return submitCandidateHandlerWithResolver(
    request(uid, {
      tripId,
      expectedPlanningCycle: 1,
      placeId,
      preference: "INTERESTED",
      preferredPeriod: "ANYTIME",
      estimatedDurationMinutes: 60,
      durationSource: "USER_OVERRIDE",
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

describeEmulator("Fixed Bookings Backend Integration", { timeout: 30000 }, () => {
  beforeAll(() => {
    if (!getApps().length) initializeApp({ projectId: "travel-planner-bookings-test" });
  });

  describe("reportFixedBooking", () => {
    it("reports booking in solo mode as CONFIRMED and group mode as PENDING", async () => {
      const { tripId } = await createTrip();
      const placeId = "attr-1";
      await submitCandidate("owner", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      // Solo mode report -> CONFIRMED
      const soloReport = await reportFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );
      expect(soloReport.status).toBe("CONFIRMED");
      expect(soloReport.bookingId).toBeDefined();

      const db = getFirestore();
      const soloBookingSnap = await db
        .collection("trips")
        .doc(tripId)
        .collection("fixedBookings")
        .doc(soloReport.bookingId)
        .get();
      expect(soloBookingSnap.data()?.confirmedBy).toBe("owner");

      // Group mode: add member1
      const tripData = await createTrip();
      const tripId2 = tripData.tripId;
      await joinTripHandler(request("member1", { tripId: tripId2, inviteToken: tripData.inviteToken }));
      await submitCandidate("member1", tripId2, placeId);

      // Group report by member1 -> PENDING_CONFIRMATION
      const groupReport = await reportFixedBookingHandler(
        request("member1", {
          tripId: tripId2,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "14:00",
          endTime: "16:00",
        })
      );
      expect(groupReport.status).toBe("PENDING_CONFIRMATION");

      const groupBookingSnap = await db
        .collection("trips")
        .doc(tripId2)
        .collection("fixedBookings")
        .doc(groupReport.bookingId)
        .get();
      expect(groupBookingSnap.data()?.reportedBy).toBe("member1");
      expect(groupBookingSnap.data()?.confirmedBy).toBeUndefined();
    });

    it("accepts active and inactive candidates, caller need not own submission", async () => {
      const tripData = await createTrip();
      const tripId = tripData.tripId;
      await joinTripHandler(request("member1", { tripId, inviteToken: tripData.inviteToken }));
      const placeId = "attr-inactive";
      await submitCandidate("owner", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      const db = getFirestore();
      // Deactivate candidate
      await db.collection("trips").doc(tripId).collection("candidates").doc(candidateId).update({ active: false });

      // Member1 reports booking on inactive candidate submitted by owner -> succeeds
      const report = await reportFixedBookingHandler(
        request("member1", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-03",
          startTime: "11:00",
          durationMinutes: 90,
        })
      );
      expect(report.status).toBe("PENDING_CONFIRMATION");
    });

    it("preserves a reported booking when its candidate is deactivated", async () => {
      const tripData = await createTrip();
      await joinTripHandler(request("member1", { tripId: tripData.tripId, inviteToken: tripData.inviteToken }));
      const placeId = "attr-deactivate-after-report";
      await submitCandidate("owner", tripData.tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);
      const report = await reportFixedBookingHandler(request("member1", {
        tripId: tripData.tripId, expectedPlanningCycle: 1, candidateId,
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      }));
      const db = getFirestore();
      const before = (await db.doc(`trips/${tripData.tripId}/fixedBookings/${report.bookingId}`).get()).data();
      await db.doc(`trips/${tripData.tripId}/candidates/${candidateId}`).update({ active: false });
      const after = (await db.doc(`trips/${tripData.tripId}/fixedBookings/${report.bookingId}`).get()).data();
      expect(after).toEqual(before);
    });

    it("preserves a booking when its reporter is removed", async () => {
      const tripData = await createTrip();
      await joinTripHandler(request("member1", { tripId: tripData.tripId, inviteToken: tripData.inviteToken }));
      const placeId = "attr-reporter-removal";
      await submitCandidate("member1", tripData.tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);
      const report = await reportFixedBookingHandler(request("member1", {
        tripId: tripData.tripId, expectedPlanningCycle: 1, candidateId,
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      }));
      await removeMemberHandler(request("owner", {
        tripId: tripData.tripId, memberId: "member1", expectedPlanningCycle: 1,
      }));
      const booking = (await getFirestore().doc(`trips/${tripData.tripId}/fixedBookings/${report.bookingId}`).get()).data();
      expect(booking).toMatchObject({ reportedBy: "member1", status: "PENDING_CONFIRMATION" });
    });

    it("rejects reporting when ACTIVE-owner authority is malformed", async () => {
      const { tripId } = await createTrip();
      const db = getFirestore();
      await submitCandidate("owner", tripId, "attr-malformed-owner");
      await db.doc(`trips/${tripId}`).update({ ownerId: "different-owner" });
      expect(await reasonOf(() => reportFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("attr-malformed-owner"),
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      })))).toBe("CONFLICT");
    });

    it("validates trip date range boundaries (first/last day valid, outside invalid)", async () => {
      const { tripId } = await createTrip();
      const placeId = "attr-date";
      await submitCandidate("owner", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      // Start date 2026-10-01 valid
      const r1 = await reportFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-01",
          startTime: "09:00",
          endTime: "10:00",
        })
      );
      expect(r1.status).toBe("CONFIRMED");

      // End date 2026-10-05 valid
      const r2 = await reportFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-05",
          startTime: "09:00",
          endTime: "10:00",
        })
      );
      expect(r2.status).toBe("CONFIRMED");

      // Date before startDate -> INVALID_INPUT
      expect(
        await reasonOf(() =>
          reportFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              candidateId,
              date: "2026-09-30",
              startTime: "09:00",
              endTime: "10:00",
            })
          )
        )
      ).toBe("INVALID_INPUT");

      // Date after endDate -> INVALID_INPUT
      expect(
        await reasonOf(() =>
          reportFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              candidateId,
              date: "2026-10-06",
              startTime: "09:00",
              endTime: "10:00",
            })
          )
        )
      ).toBe("INVALID_INPUT");
    });

    it("rejects missing or malformed candidate records", async () => {
      const { tripId } = await createTrip();
      const db = getFirestore();

      // Missing candidate -> NOT_FOUND
      expect(
        await reasonOf(() =>
          reportFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              candidateId: "nonexistent_cand",
              date: "2026-10-02",
              startTime: "10:00",
              durationMinutes: 60,
            })
          )
        )
      ).toBe("NOT_FOUND");

      // Corrupted candidate schema -> CONFLICT
      const candRef = db.collection("trips").doc(tripId).collection("candidates").doc("corrupt_cand");
      await candRef.set({ placeId: "bad", active: "not_a_bool" });
      expect(
        await reasonOf(() =>
          reportFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              candidateId: "corrupt_cand",
              date: "2026-10-02",
              startTime: "10:00",
              durationMinutes: 60,
            })
          )
        )
      ).toBe("CONFLICT");
    });

    it("rejects a valid candidate copied to an incorrect document identity", async () => {
      const { tripId } = await createTrip();
      const placeId = "identity-mismatch-place";
      const { candidateId } = await submitCandidate("owner", tripId, placeId);
      const db = getFirestore();
      const validCandidate = await db
        .collection("trips")
        .doc(tripId)
        .collection("candidates")
        .doc(candidateId)
        .get();
      expect(validCandidate.exists).toBe(true);

      const incorrectCandidateId = `${candidateId}-incorrect`;
      await db
        .collection("trips")
        .doc(tripId)
        .collection("candidates")
        .doc(incorrectCandidateId)
        .set(validCandidate.data()!);

      expect(
        await reasonOf(() =>
          reportFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              candidateId: incorrectCandidateId,
              date: "2026-10-02",
              startTime: "10:00",
              durationMinutes: 60,
            })
          )
        )
      ).toBe("CONFLICT");
    });
  });

  describe("confirmFixedBooking", () => {
    it("confirms pending booking (changed: true) and is idempotent (changed: false)", async () => {
      const tripData = await createTrip();
      const tripId = tripData.tripId;
      await joinTripHandler(request("member1", { tripId, inviteToken: tripData.inviteToken }));
      const placeId = "attr-confirm";
      await submitCandidate("member1", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      const report = await reportFixedBookingHandler(
        request("member1", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );

      // Non-owner cannot confirm -> OWNER_REQUIRED
      expect(
        await reasonOf(() =>
          confirmFixedBookingHandler(
            request("member1", { tripId, expectedPlanningCycle: 1, bookingId: report.bookingId })
          )
        )
      ).toBe("OWNER_REQUIRED");

      // OWNER confirms -> changed: true
      const confirm1 = await confirmFixedBookingHandler(
        request("owner", { tripId, expectedPlanningCycle: 1, bookingId: report.bookingId })
      );
      expect(confirm1).toEqual({
        bookingId: report.bookingId,
        status: "CONFIRMED",
        changed: true,
        phase: "COLLECTING",
        planningCycle: 1,
      });

      // Repeat confirm -> changed: false (idempotent, no write)
      const confirm2 = await confirmFixedBookingHandler(
        request("owner", { tripId, expectedPlanningCycle: 1, bookingId: report.bookingId })
      );
      expect(confirm2).toEqual({
        bookingId: report.bookingId,
        status: "CONFIRMED",
        changed: false,
        phase: "COLLECTING",
        planningCycle: 1,
      });

      // Provenance preserved: reportedBy is still member1, confirmedBy is owner
      const db = getFirestore();
      const bookingSnap = await db
        .collection("trips")
        .doc(tripId)
        .collection("fixedBookings")
        .doc(report.bookingId)
        .get();
      expect(bookingSnap.data()?.reportedBy).toBe("member1");
      expect(bookingSnap.data()?.confirmedBy).toBe("owner");
    });

    it("enforces phase guard before idempotent replay", async () => {
      const { tripId } = await createTrip();
      const placeId = "attr-phase";
      await submitCandidate("owner", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      const report = await reportFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );
      expect(report.status).toBe("CONFIRMED");

      const db = getFirestore();
      await db.collection("trips").doc(tripId).update({ phase: "PLANNING" });

      // Even if already confirmed, phase guard runs before idempotency
      expect(
        await reasonOf(() =>
          confirmFixedBookingHandler(
            request("owner", { tripId, expectedPlanningCycle: 1, bookingId: report.bookingId })
          )
        )
      ).toBe("INVALID_PHASE");
    });

    it("checks phase and planning cycle before booking lookup", async () => {
      const { tripId } = await createTrip();
      const db = getFirestore();
      await db.doc(`trips/${tripId}`).update({ phase: "PLANNING" });
      expect(await reasonOf(() => confirmFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, bookingId: "missing-booking",
      })))).toBe("INVALID_PHASE");
      await db.doc(`trips/${tripId}`).update({ phase: "COLLECTING" });
      expect(await reasonOf(() => confirmFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 99, bookingId: "missing-booking",
      })))).toBe("STALE_PLANNING_CYCLE");
    });

    it("does not rewrite an already-confirmed legacy one-sided booking on replay", async () => {
      const { tripId } = await createTrip();
      const bookingRef = getFirestore().doc(`trips/${tripId}/fixedBookings/legacy_confirmed_replay`);
      const original = {
        candidateId: "cand_legacy_replay", date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
        status: "CONFIRMED", reportedBy: "owner", reportedAt: Timestamp.now(),
        confirmedBy: "owner", confirmedAt: Timestamp.now(),
      };
      await bookingRef.set(original);
      const before = (await bookingRef.get()).data();
      const result = await confirmFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, bookingId: "legacy_confirmed_replay",
      }));
      expect(result.changed).toBe(false);
      expect((await bookingRef.get()).data()).toEqual(before);
    });

    it("normalizes legacy one-sided timing during PENDING -> CONFIRMED", async () => {
      const tripData = await createTrip();
      const tripId = tripData.tripId;
      const db = getFirestore();

      // Seed a legacy one-sided PENDING booking (has durationMinutes, no endTime)
      const bookingRef = db.collection("trips").doc(tripId).collection("fixedBookings").doc("legacy_pending");
      await bookingRef.set({
        candidateId: "cand_legacy",
        date: "2026-10-02",
        startTime: "14:00",
        durationMinutes: 60,
        status: "PENDING_CONFIRMATION",
        reportedBy: "owner",
        reportedAt: Timestamp.now(),
      });

      const confirmRes = await confirmFixedBookingHandler(
        request("owner", { tripId, expectedPlanningCycle: 1, bookingId: "legacy_pending" })
      );
      expect(confirmRes.changed).toBe(true);

      const confirmedSnap = await bookingRef.get();
      expect(confirmedSnap.data()?.endTime).toBe("15:00");
      expect(confirmedSnap.data()?.durationMinutes).toBe(60);
      expect(confirmedSnap.data()?.status).toBe("CONFIRMED");
    });
  });

  describe("changeFixedBooking", () => {
    it("UPDATE: mutates confirmed booking and detects no-op vs canonicalization", async () => {
      const tripData = await createTrip();
      const tripId = tripData.tripId;
      const placeId = "attr-change";
      await submitCandidate("owner", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      const report = await reportFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );
      const db = getFirestore();
      const beforeUpdate = (await db.doc(`trips/${tripId}/fixedBookings/${report.bookingId}`).get()).data();

      // Existing booking has both endTime: 11:00 and durationMinutes: 60.
      // Calling UPDATE with identical interval and date -> changed: false (no write)
      const noOpRes = await changeFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          bookingId: report.bookingId,
          action: "UPDATE",
          date: "2026-10-02",
          startTime: "10:00",
          endTime: "11:00",
          durationMinutes: 60,
        })
      );
      expect(noOpRes.changed).toBe(false);

      // Calling UPDATE with different date -> changed: true
      const updateDateRes = await changeFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          bookingId: report.bookingId,
          action: "UPDATE",
          date: "2026-10-03",
          startTime: "10:00",
          endTime: "11:00",
        })
      );
      expect(updateDateRes.changed).toBe(true);

      const bookingSnap = await db.collection("trips").doc(tripId).collection("fixedBookings").doc(report.bookingId).get();
      expect(bookingSnap.data()?.date).toBe("2026-10-03");
      expect(bookingSnap.data()).toMatchObject({
        candidateId: beforeUpdate?.candidateId,
        reportedBy: beforeUpdate?.reportedBy,
        reportedAt: beforeUpdate?.reportedAt,
        confirmedBy: beforeUpdate?.confirmedBy,
        confirmedAt: beforeUpdate?.confirmedAt,
      });

      // Non-member rejects with NOT_MEMBER
      expect(
        await reasonOf(() =>
          changeFixedBookingHandler(
            request("non_member", {
              tripId,
              expectedPlanningCycle: 1,
              bookingId: report.bookingId,
              action: "UPDATE",
              date: "2026-10-03",
              startTime: "10:00",
              endTime: "11:00",
            })
          )
        )
      ).toBe("NOT_MEMBER");

      // Active non-owner member rejects with OWNER_REQUIRED
      const inviteToken = tripData.inviteToken;
      await joinTripHandler(request("member1", { tripId, inviteToken }));
      expect(
        await reasonOf(() =>
          changeFixedBookingHandler(
            request("member1", {
              tripId,
              expectedPlanningCycle: 1,
              bookingId: report.bookingId,
              action: "UPDATE",
              date: "2026-10-03",
              startTime: "10:00",
              endTime: "11:00",
            })
          )
        )
      ).toBe("OWNER_REQUIRED");

      expect(
        await reasonOf(() =>
          changeFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 99,
              bookingId: report.bookingId,
              action: "UPDATE",
              date: "2026-10-03",
              startTime: "10:00",
              endTime: "11:00",
            })
          )
        )
      ).toBe("STALE_PLANNING_CYCLE");
    });

    it("UPDATE: canonicalizes legacy one-sided CONFIRMED record with same interval -> changed: true", async () => {
      const { tripId } = await createTrip();
      const db = getFirestore();

      // Seed legacy one-sided CONFIRMED record (has durationMinutes, no endTime)
      const bookingRef = db.collection("trips").doc(tripId).collection("fixedBookings").doc("legacy_confirmed");
      await bookingRef.set({
        candidateId: "cand_1",
        date: "2026-10-02",
        startTime: "10:00",
        durationMinutes: 60,
        status: "CONFIRMED",
        reportedBy: "owner",
        reportedAt: Timestamp.now(),
        confirmedBy: "owner",
        confirmedAt: Timestamp.now(),
      });

      // Update with matching logical interval (10:00 - 11:00)
      const res = await changeFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          bookingId: "legacy_confirmed",
          action: "UPDATE",
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );
      // Because raw existing lacked endTime, normalization is a persistent schema change -> changed: true
      expect(res.changed).toBe(true);

      const updatedSnap = await bookingRef.get();
      expect(updatedSnap.data()?.endTime).toBe("11:00");
      expect(updatedSnap.data()?.durationMinutes).toBe(60);
    });

    it("rejects UPDATE dates outside the trip range", async () => {
      const { tripId } = await createTrip();
      await submitCandidate("owner", tripId, "attr-update-date");
      const booking = await reportFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("attr-update-date"),
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      }));
      for (const date of ["2026-09-30", "2026-10-06"]) {
        expect(await reasonOf(() => changeFixedBookingHandler(request("owner", {
          tripId, expectedPlanningCycle: 1, bookingId: booking.bookingId, action: "UPDATE",
          date, startTime: "10:00", durationMinutes: 60,
        })))).toBe("INVALID_INPUT");
      }
    });

    it("UPDATE: rejects PENDING booking target with CONFLICT", async () => {
      const tripData = await createTrip();
      const tripId = tripData.tripId;
      await joinTripHandler(request("member1", { tripId, inviteToken: tripData.inviteToken }));
      const placeId = "attr-target";
      await submitCandidate("member1", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      const report = await reportFixedBookingHandler(
        request("member1", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );
      expect(report.status).toBe("PENDING_CONFIRMATION");

      // Cannot UPDATE a PENDING booking -> CONFLICT
      expect(
        await reasonOf(() =>
          changeFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              bookingId: report.bookingId,
              action: "UPDATE",
              date: "2026-10-02",
              startTime: "10:00",
              durationMinutes: 90,
            })
          )
        )
      ).toBe("CONFLICT");
    });

    it("checks phase and planning cycle before booking lookup", async () => {
      const { tripId } = await createTrip();
      const db = getFirestore();
      await db.doc(`trips/${tripId}`).update({ phase: "PLANNING" });
      expect(await reasonOf(() => changeFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, bookingId: "missing-change", action: "CANCEL", cancel: true,
      })))).toBe("INVALID_PHASE");
      await db.doc(`trips/${tripId}`).update({ phase: "COLLECTING" });
      expect(await reasonOf(() => changeFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 99, bookingId: "missing-change", action: "CANCEL", cancel: true,
      })))).toBe("STALE_PLANNING_CYCLE");
    });

    it("keeps booking state valid when ownership transfer races UPDATE", async () => {
      const tripData = await createTrip();
      await joinTripHandler(request("member1", { tripId: tripData.tripId, inviteToken: tripData.inviteToken }));
      await submitCandidate("owner", tripData.tripId, "attr-owner-race");
      const booking = await reportFixedBookingHandler(request("owner", {
        tripId: tripData.tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("attr-owner-race"),
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      }));
      await confirmFixedBookingHandler(request("owner", { tripId: tripData.tripId, expectedPlanningCycle: 1, bookingId: booking.bookingId }));
      const results = await Promise.allSettled([
        transferOwnershipHandler(request("owner", { tripId: tripData.tripId, newOwnerId: "member1" })),
        changeFixedBookingHandler(request("owner", {
          tripId: tripData.tripId, expectedPlanningCycle: 1, bookingId: booking.bookingId, action: "UPDATE",
          date: "2026-10-03", startTime: "10:00", durationMinutes: 60,
        })),
      ]);
      const trip = (await getFirestore().doc(`trips/${tripData.tripId}`).get()).data();
      expect(trip?.ownerId).toBe("member1");
      expect(results.some(result => result.status === "fulfilled")).toBe(true);
    }, 30000);

    it("does not mix a booking UPDATE with a concurrent phase transition", async () => {
      const { tripId } = await createTrip();
      await submitCandidate("owner", tripId, "attr-phase-race");
      const booking = await reportFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("attr-phase-race"),
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      }));
      const db = getFirestore();
      const results = await Promise.allSettled([
        changeFixedBookingHandler(request("owner", {
          tripId, expectedPlanningCycle: 1, bookingId: booking.bookingId, action: "UPDATE",
          date: "2026-10-03", startTime: "10:00", durationMinutes: 60,
        })),
        db.runTransaction(async transaction => {
          const tripRef = db.doc(`trips/${tripId}`);
          await transaction.get(tripRef);
          transaction.update(tripRef, { phase: "PLANNING" });
        }),
      ]);
      expect((await db.doc(`trips/${tripId}`).get()).data()?.phase).toBe("PLANNING");
      expect(results.some(result => result.status === "fulfilled")).toBe(true);
    }, 30000);

    it("rejects stale UPDATE after a real planning-cycle transition", async () => {
      const tripData = await createTrip();
      await joinTripHandler(request("member1", { tripId: tripData.tripId, inviteToken: tripData.inviteToken }));
      await submitCandidate("owner", tripData.tripId, "attr-cycle-race");
      await startVotingHandler(request("owner", { tripId: tripData.tripId, expectedPlanningCycle: 1 }));
      const booking = await reportFixedBookingHandler(request("owner", {
        tripId: tripData.tripId, expectedPlanningCycle: 1, candidateId: candidateIdFromPlaceId("attr-cycle-race"),
        date: "2026-10-02", startTime: "10:00", durationMinutes: 60,
      }));
      await confirmFixedBookingHandler(request("owner", { tripId: tripData.tripId, expectedPlanningCycle: 1, bookingId: booking.bookingId }));
      const results = await Promise.allSettled([
        changeFixedBookingHandler(request("owner", {
          tripId: tripData.tripId, expectedPlanningCycle: 1, bookingId: booking.bookingId, action: "UPDATE",
          date: "2026-10-03", startTime: "10:00", durationMinutes: 60,
        })),
        reopenTripPhaseHandler(request("owner", { tripId: tripData.tripId, expectedPlanningCycle: 1, targetPhase: "VOTING" })),
      ]);
      const trip = (await getFirestore().doc(`trips/${tripData.tripId}`).get()).data();
      expect(trip).toMatchObject({ phase: "VOTING", planningCycle: 2 });
      const rejected = results.find(result => result.status === "rejected");
      if (rejected) expect((rejected.reason as { details?: { reason?: string } }).details?.reason).toBe("STALE_PLANNING_CYCLE");
    }, 30000);

    it("CANCEL: deletes confirmed booking (changed: true), repeated CANCEL -> NOT_FOUND", async () => {
      const { tripId } = await createTrip();
      const placeId = "attr-cancel";
      await submitCandidate("owner", tripId, placeId);
      const candidateId = candidateIdFromPlaceId(placeId);

      const report = await reportFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          candidateId,
          date: "2026-10-02",
          startTime: "10:00",
          durationMinutes: 60,
        })
      );

      const cancelRes = await changeFixedBookingHandler(
        request("owner", {
          tripId,
          expectedPlanningCycle: 1,
          bookingId: report.bookingId,
          action: "CANCEL",
          cancel: true,
        })
      );
      expect(cancelRes).toEqual({
        bookingId: report.bookingId,
        action: "CANCEL",
        changed: true,
        phase: "COLLECTING",
        planningCycle: 1,
      });

      const db = getFirestore();
      const deletedSnap = await db.collection("trips").doc(tripId).collection("fixedBookings").doc(report.bookingId).get();
      expect(deletedSnap.exists).toBe(false);

      // Repeated CANCEL -> NOT_FOUND (no tombstones)
      expect(
        await reasonOf(() =>
          changeFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              bookingId: report.bookingId,
              action: "CANCEL",
              cancel: true,
            })
          )
        )
      ).toBe("NOT_FOUND");
    });

    it("maps persisted corruption (inconsistent timing or cross-midnight) to CONFLICT", async () => {
      const { tripId } = await createTrip();
      const db = getFirestore();

      // Seed inconsistent timing in confirmed booking
      await db.collection("trips").doc(tripId).collection("fixedBookings").doc("inconsistent_booking").set({
        candidateId: "cand_1",
        date: "2026-10-02",
        startTime: "10:00",
        endTime: "12:00",
        durationMinutes: 60, // inconsistent with 10:00-12:00 (120 min)
        status: "CONFIRMED",
        reportedBy: "owner",
        reportedAt: Timestamp.now(),
        confirmedBy: "owner",
        confirmedAt: Timestamp.now(),
      });

      expect(
        await reasonOf(() =>
          changeFixedBookingHandler(
            request("owner", {
              tripId,
              expectedPlanningCycle: 1,
              bookingId: "inconsistent_booking",
              action: "UPDATE",
              date: "2026-10-02",
              startTime: "10:00",
              endTime: "11:00",
            })
          )
        )
      ).toBe("CONFLICT");
    });

    it("rejects structurally valid persisted cross-midnight timing", async () => {
      const { tripId } = await createTrip();
      const bookingRef = getFirestore().doc(`trips/${tripId}/fixedBookings/cross_midnight_booking`);
      await bookingRef.set({
        candidateId: "cand_cross_midnight", date: "2026-10-02", startTime: "23:30", durationMinutes: 60,
        status: "CONFIRMED", reportedBy: "owner", reportedAt: Timestamp.now(),
        confirmedBy: "owner", confirmedAt: Timestamp.now(),
      });
      expect(await reasonOf(() => changeFixedBookingHandler(request("owner", {
        tripId, expectedPlanningCycle: 1, bookingId: "cross_midnight_booking", action: "UPDATE",
        date: "2026-10-02", startTime: "23:30", durationMinutes: 60,
      })))).toBe("CONFLICT");
    });
  });
});
