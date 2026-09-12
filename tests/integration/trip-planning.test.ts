import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { POST as resolveRescue } from "@/app/api/trips/[tripId]/rescue/[eventId]/resolve/route";
import { POST as buildItinerary } from "@/app/api/trips/[tripId]/build-itinerary/route";
import { POST as confirmShortlist } from "@/app/api/trips/[tripId]/shortlist/route";
import { DELETE as removeSuggestion, POST as addSuggestion } from "@/app/api/trips/[tripId]/places/route";
import { POST as submitSuggestions } from "@/app/api/trips/[tripId]/submit-suggestions/route";
import { POST as submitVotes } from "@/app/api/trips/[tripId]/submit-votes/route";
import { POST as toggleVote } from "@/app/api/trips/[tripId]/votes/route";
import { POST as createTrip } from "@/app/api/trips/route";
import { PATCH as updateTrip } from "@/app/api/trips/[tripId]/route";
import { POST as updatePreferences } from "@/app/api/members/[memberId]/preferences/route";
import { POST as addGroupMember } from "@/app/api/groups/[groupId]/members/route";
import { POST as setDemoSession } from "@/app/api/demo-session/route";
import { GET as bootstrap } from "@/app/api/bootstrap/route";
import { GET as getPlacePhoto } from "@/app/api/places/[placeId]/photo/route";
import { GET as getSplitBill, PUT as saveSplitBill } from "@/app/api/trips/[tripId]/split-bill/route";
import { GET as getChecklist, POST as createChecklistItem } from "@/app/api/trips/[tripId]/checklist/route";
import { DELETE as deleteChecklistItem, PATCH as updateChecklistItem } from "@/app/api/trips/[tripId]/checklist/[itemId]/route";
import { DELETE as removeActivityBackup, PUT as assignActivityBackup } from "@/app/api/trips/[tripId]/itinerary/[activityId]/backup/route";
import { POST as createInvite } from "@/app/api/groups/[groupId]/invite/route";
import { POST as joinInvite } from "@/app/api/invites/[token]/join/route";
import { DELETE as deleteGroup, PATCH as renameGroup } from "@/app/api/groups/[groupId]/route";
import { prisma } from "@/lib/server/prisma";
import { provisionGoogleMember } from "@/lib/server/auth-identities";
import { requireTripActor, requireTripOrganizer } from "@/lib/server/authorization";
import { setAuthenticatedMemberIdForTests } from "@/lib/server/auth";
import { isDemoAuthEnabled } from "@/lib/server/demo-auth";
import { buildConsensus } from "@/lib/group-consensus";
import { computeBookingPressure } from "@/lib/booking-pressure";
import type { Member, Place, Trip } from "@/lib/types";

const tripContext = (tripId: string) => ({ params: Promise.resolve({ tripId }) });
const rescueContext = (tripId: string, eventId: string) => ({ params: Promise.resolve({ tripId, eventId }) });
const memberContext = (memberId: string) => ({ params: Promise.resolve({ memberId }) });
const groupContext = (groupId: string) => ({ params: Promise.resolve({ groupId }) });
const photoContext = (placeId: string) => ({ params: Promise.resolve({ placeId }) });
const splitBillContext = (tripId: string) => ({ params: Promise.resolve({ tripId }) });
const checklistItemContext = (tripId: string, itemId: string) => ({ params: Promise.resolve({ tripId, itemId }) });
const activityBackupContext = (tripId: string, activityId: string) => ({ params: Promise.resolve({ tripId, activityId }) });

function request(body: unknown, raw = false) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

function deleteRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function place(id: string, duration = 60) {
  return {
    id,
    name: id,
    category: "Museum",
    area: "Central",
    destination: "Tokyo",
    lat: 35.68,
    lng: 139.76,
    address: "Tokyo",
    photo: "#000",
    rating: 4,
    reviewCount: 10,
    priceLevel: 2,
    priceLabel: "$$",
    description: "Test place",
    openingHoursJson: "[]",
    isOpenNow: true,
    estimatedDurationMinutes: duration,
    reviewsJson: "[]",
    availability: "available",
    source: "catalog",
  };
}

function trip(id: string, groupId: string) {
  return {
    id,
    groupId,
    name: id,
    destinationsJson: '["Tokyo"]',
    coverColor: "#000",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
    budgetTotal: 1000,
    groupSize: 2,
    dailyStart: "08:00",
    dailyEnd: "20:00",
    transport: "Walking",
    stage: "voting",
    shortlistJson: "[]",
    recommendedPlaceCount: 2,
    votesPerMember: 10,
    itineraryJson: "[]",
    itineraryRevision: 1,
    pricePressureJson: "{}",
  };
}

async function resetFixture() {
  await prisma.vote.deleteMany();
  await prisma.suggestion.deleteMany();
  await prisma.groupInvite.deleteMany();
  await prisma.authIdentity.deleteMany();
  await prisma.tripPlace.deleteMany();
  await prisma.tripChecklistItem.deleteMany();
  await prisma.rescueEvent.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.place.deleteMany();
  await prisma.member.deleteMany();

  await prisma.member.createMany({
    data: [
      { id: "member-a", name: "Member A", initials: "A", avatarColor: "#000" },
      { id: "member-b", name: "Member B", initials: "B", avatarColor: "#000" },
      { id: "outsider", name: "Outsider", initials: "O", avatarColor: "#000" },
    ],
  });
  await prisma.group.createMany({
    data: [
      { id: "group-a", name: "Group A", emoji: "A", coverColor: "#000" },
      { id: "group-b", name: "Group B", emoji: "B", coverColor: "#000" },
    ],
  });
  await prisma.groupMember.createMany({
    data: [
      { groupId: "group-a", memberId: "member-a", role: "organizer" },
      { groupId: "group-a", memberId: "member-b", role: "member" },
      { groupId: "group-b", memberId: "outsider", role: "member" },
    ],
  });
  await prisma.place.createMany({ data: [place("place-a"), place("place-a2"), place("place-b")] });
  await prisma.trip.createMany({ data: [trip("trip-a", "group-a"), trip("trip-b", "group-b")] });
  await prisma.tripPlace.createMany({
    data: [
      { tripId: "trip-a", placeId: "place-a" },
      { tripId: "trip-a", placeId: "place-a2" },
      { tripId: "trip-b", placeId: "place-b" },
    ],
  });
}

beforeEach(async () => {
  setAuthenticatedMemberIdForTests("member-a");
  await resetFixture();
});
after(() => prisma.$disconnect());

test("authenticated actor and trip role come from the server", async () => {
  assert.deepEqual(await requireTripActor("trip-a"), {
    memberId: "member-a",
    role: "organizer",
    trip: await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } }),
  });

  setAuthenticatedMemberIdForTests("member-b");
  assert.equal((await requireTripActor("trip-a")).role, "member");
  await assert.rejects(requireTripOrganizer("trip-a"), (error: unknown) => {
    return error instanceof Error && "code" in error && error.code === "ORGANIZER_REQUIRED";
  });
});

test("missing and stale authenticated actors are rejected", async () => {
  setAuthenticatedMemberIdForTests(null);
  let response = await toggleVote(request({ placeId: "place-a", voted: true }), tripContext("trip-a"));
  assert.equal(response.status, 401);
  assert.equal((await body(response)).code, "UNAUTHENTICATED");

  setAuthenticatedMemberIdForTests("missing");
  response = await toggleVote(request({ placeId: "place-a", voted: true }), tripContext("trip-a"));
  assert.equal(response.status, 401);
  assert.equal((await body(response)).code, "UNAUTHENTICATED");
});

test("demo identity is disabled in production and at the test boundary", async () => {
  assert.equal(isDemoAuthEnabled({ AUTH_DEMO_ENABLED: "true", NODE_ENV: "production" }), false);
  assert.equal(isDemoAuthEnabled({ AUTH_DEMO_ENABLED: "true", NODE_ENV: "development" }), true);
  assert.equal((await setDemoSession(request({ memberId: "member-b" }))).status, 404);
});

test("Google identities provision one stable Member per provider account", async () => {
  const first = await provisionGoogleMember({ providerAccountId: "google-a", email: "a@example.com", name: "A Traveller" });
  const repeated = await provisionGoogleMember({ providerAccountId: "google-a", email: "changed@example.com", name: "Changed Name" });
  const second = await provisionGoogleMember({ providerAccountId: "google-b", email: "b@example.com", name: "B Traveller" });
  assert.equal(repeated, first);
  assert.notEqual(second, first);
  assert.equal(await prisma.member.count({ where: { id: { in: [first, second] } } }), 2);
  assert.equal(await prisma.authIdentity.count({ where: { provider: "google" } }), 2);
});

test("bootstrap only returns groups, trips, members, and places reachable by the actor", async () => {
  const response = await bootstrap();
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.deepEqual(Object.keys(result.groups as object), ["group-a"]);
  assert.deepEqual(Object.keys(result.trips as object), ["trip-a"]);
  assert.deepEqual(Object.keys(result.places as object).sort(), ["place-a", "place-a2"]);
  assert.deepEqual(Object.keys(result.members as object).sort(), ["member-a", "member-b"]);
});

test("bootstrap isolates shared place activity by trip", async () => {
  await prisma.trip.create({ data: trip("trip-a2", "group-a") });
  await prisma.tripPlace.create({ data: { tripId: "trip-a2", placeId: "place-a" } });
  assert.equal((await addSuggestion(request({ placeId: "place-a" }), tripContext("trip-a"))).status, 200);
  assert.equal((await toggleVote(request({ placeId: "place-a", voted: true }), tripContext("trip-a"))).status, 200);

  const snapshot = await body(await bootstrap()) as unknown as {
    places: Record<string, Place>;
    tripPlaces: Record<string, Record<string, Place>>;
    members: Record<string, Member>;
  };
  assert.deepEqual(snapshot.places["place-a"].suggestedBy, []);
  assert.deepEqual(snapshot.places["place-a"].votedBy, []);
  assert.equal(snapshot.places["place-a"].voteCount, 0);
  assert.deepEqual(snapshot.members["member-a"].suggestedPlaceIds, []);
  assert.deepEqual(snapshot.members["member-a"].votedPlaceIds, []);
  assert.deepEqual(snapshot.tripPlaces["trip-a"]["place-a"].suggestedBy, ["member-a"]);
  assert.deepEqual(snapshot.tripPlaces["trip-a"]["place-a"].votedBy, ["member-a"]);
  assert.equal(snapshot.tripPlaces["trip-a"]["place-a"].voteCount, 1);
  assert.deepEqual(snapshot.tripPlaces["trip-a2"]["place-a"].suggestedBy, []);
  assert.deepEqual(snapshot.tripPlaces["trip-a2"]["place-a"].votedBy, []);
  assert.equal(snapshot.tripPlaces["trip-a2"]["place-a"].voteCount, 0);
  assert.equal(buildConsensus({
    members: [snapshot.members["member-a"], snapshot.members["member-b"]],
    candidates: [snapshot.tripPlaces["trip-a2"]["place-a"]],
    capacity: 1,
  }).candidates["place-a"].voteCount, 0);
});

test("unauthenticated bootstrap is rejected", async () => {
  setAuthenticatedMemberIdForTests(null);
  const response = await bootstrap();
  assert.equal(response.status, 401);
  assert.equal((await body(response)).code, "UNAUTHENTICATED");
});

test("shared trip checklist is persisted, trip-scoped, and membership-authorized", async () => {
  let response = await createChecklistItem(request({ title: "  Book tickets  ", assignedMemberId: "member-b" }), tripContext("trip-a"));
  assert.equal(response.status, 200);
  const item = (await body(response)).item as { id: string; title: string; assignedMemberId: string | null; completed: boolean };
  assert.equal(item.title, "Book tickets");
  assert.equal(item.assignedMemberId, "member-b");
  assert.equal(item.completed, false);
  assert.ok(await prisma.tripChecklistItem.findUnique({ where: { id: item.id } }));

  response = await updateChecklistItem(request({ completed: true }), checklistItemContext("trip-a", item.id));
  assert.equal(response.status, 200);
  response = await updateChecklistItem(request({ assignedMemberId: "member-a" }), checklistItemContext("trip-a", item.id));
  assert.equal(response.status, 200);
  const listed = await body(await getChecklist(new Request("http://localhost"), tripContext("trip-a"))) as { items: { id: string; completed: boolean; assignedMemberId: string | null }[] };
  assert.deepEqual(listed.items.map(({ id, completed, assignedMemberId }) => ({ id, completed, assignedMemberId })), [
    { id: item.id, completed: true, assignedMemberId: "member-a" },
  ]);

  assert.equal((await createChecklistItem(request({ title: "Unknown", assignedMemberId: "missing" }), tripContext("trip-a"))).status, 404);
  assert.equal((await createChecklistItem(request({ title: "Outsider", assignedMemberId: "outsider" }), tripContext("trip-a"))).status, 403);
  assert.equal((await createChecklistItem(request({ title: "" }), tripContext("trip-a"))).status, 400);

  await prisma.tripChecklistItem.create({ data: { id: "foreign-checklist", tripId: "trip-b", title: "Foreign" } });
  assert.equal((await updateChecklistItem(request({ completed: true }), checklistItemContext("trip-a", "foreign-checklist"))).status, 404);
  setAuthenticatedMemberIdForTests("outsider");
  assert.equal((await getChecklist(new Request("http://localhost"), tripContext("trip-a"))).status, 403);
  setAuthenticatedMemberIdForTests("member-a");
  response = await deleteChecklistItem(new Request("http://localhost", { method: "DELETE" }), checklistItemContext("trip-a", item.id));
  assert.equal(response.status, 200);
  assert.equal(await prisma.tripChecklistItem.findUnique({ where: { id: item.id } }), null);
});

test("group rename is organizer-only and strictly validated", async () => {
  setAuthenticatedMemberIdForTests(null);
  assert.equal((await renameGroup(request({ name: "Renamed" }), groupContext("group-a"))).status, 401);
  setAuthenticatedMemberIdForTests("outsider");
  assert.equal((await renameGroup(request({ name: "Renamed" }), groupContext("group-a"))).status, 403);
  setAuthenticatedMemberIdForTests("member-b");
  assert.equal((await renameGroup(request({ name: "Renamed" }), groupContext("group-a"))).status, 403);
  setAuthenticatedMemberIdForTests("member-a");
  assert.equal((await renameGroup(request({ name: "" }), groupContext("group-a"))).status, 400);
  assert.equal((await renameGroup(request({ name: "   " }), groupContext("group-a"))).status, 400);
  assert.equal((await renameGroup(request({ name: "Renamed", role: "organizer" }), groupContext("group-a"))).status, 400);
  assert.equal((await renameGroup(request({ name: "Renamed" }), groupContext("missing"))).status, 404);
  const response = await renameGroup(request({ name: "  Renamed  " }), groupContext("group-a"));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true, name: "Renamed" });
  assert.equal((await prisma.group.findUniqueOrThrow({ where: { id: "group-a" } })).name, "Renamed");
});

test("group deletion is organizer-only and preserves identities and unrelated data", async () => {
  for (const actor of ["member-b", "outsider"]) {
    setAuthenticatedMemberIdForTests(actor);
    assert.equal((await deleteGroup(deleteRequest({}), groupContext("group-a"))).status, 403);
  }

  await prisma.authIdentity.create({
    data: { memberId: "member-a", provider: "google", providerAccountId: "member-a-google" },
  });
  setAuthenticatedMemberIdForTests("member-a");
  const response = await deleteGroup(deleteRequest({}), groupContext("group-a"));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true, deletedTrips: 1 });
  assert.equal(await prisma.group.findUnique({ where: { id: "group-a" } }), null);
  assert.equal(await prisma.trip.findUnique({ where: { id: "trip-a" } }), null);
  assert.equal(await prisma.groupMember.count({ where: { groupId: "group-a" } }), 0);
  assert.ok(await prisma.member.findUnique({ where: { id: "member-a" } }));
  assert.ok(await prisma.authIdentity.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: "member-a-google" } } }));
  assert.ok(await prisma.group.findUnique({ where: { id: "group-b" } }));
  assert.ok(await prisma.trip.findUnique({ where: { id: "trip-b" } }));
});

test("trip updates are organizer-only, strict, and preserve itinerary integrity", async () => {
  setAuthenticatedMemberIdForTests("member-b");
  assert.equal((await updateTrip(request({ name: "Renamed" }), tripContext("trip-a"))).status, 403);
  setAuthenticatedMemberIdForTests("member-a");
  for (const invalid of [
    { startDate: "2026-02-30" },
    { startDate: "2026-10-03", endDate: "2026-10-02" },
    { dailyStart: "20:00", dailyEnd: "08:00" },
    { transport: "Teleport" },
    { budgetTotal: -1 },
    { name: "" },
    { name: "Valid", groupId: "group-b" },
  ]) assert.equal((await updateTrip(request(invalid), tripContext("trip-a"))).status, 400);

  let response = await updateTrip(request({ name: "  Renamed  " }), tripContext("trip-a"));
  assert.equal(response.status, 200);
  let saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.equal(saved.name, "Renamed");
  assert.equal(saved.itineraryRevision, 1);

  response = await updateTrip(request({ startDate: "2026-10-02", budgetTotal: 0, dailyStart: "09:00", transport: "Mixed" }), tripContext("trip-a"));
  assert.equal(response.status, 200);
  saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.equal(saved.startDate, "2026-10-02");
  assert.equal(saved.budgetTotal, 0);
  assert.equal(saved.dailyStart, "09:00");
  assert.equal(saved.transport, "Mixed");

  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify([{ day: 1 }]) } });
  response = await updateTrip(request({ endDate: "2026-10-03" }), tripContext("trip-a"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).code, "TRIP_REPLAN_REQUIRED");
  response = await updateTrip(request({ name: "Still Safe", budgetTotal: 500 }), tripContext("trip-a"));
  assert.equal(response.status, 200);
  saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.equal(saved.name, "Still Safe");
  assert.equal(saved.budgetTotal, 500);
  assert.equal(saved.endDate, "2026-10-02");
  assert.equal(saved.itineraryRevision, 1);
});

test("client memberId cannot spoof planning identity", async () => {
  const context = tripContext("trip-a");
  assert.equal((await addSuggestion(request({ memberId: "member-b", placeId: "place-a" }), context)).status, 200);
  assert.equal((await toggleVote(request({ memberId: "member-b", placeId: "place-a", voted: true }), context)).status, 200);
  assert.equal((await submitSuggestions(request({ memberId: "member-b" }), context)).status, 200);
  assert.equal((await submitVotes(request({ memberId: "member-b" }), context)).status, 200);

  const tripPlace = await prisma.tripPlace.findUniqueOrThrow({
    where: { tripId_placeId: { tripId: "trip-a", placeId: "place-a" } },
  });
  assert.ok(await prisma.suggestion.findUnique({
    where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId: "member-a" } },
  }));
  assert.ok(await prisma.vote.findUnique({
    where: { tripPlaceId_memberId: { tripPlaceId: tripPlace.id, memberId: "member-a" } },
  }));
  assert.equal(await prisma.suggestion.count({ where: { memberId: "member-b" } }), 0);
  assert.equal(await prisma.vote.count({ where: { memberId: "member-b" } }), 0);
  const progress = await prisma.tripMemberProgress.findUniqueOrThrow({
    where: { tripId_memberId: { tripId: "trip-a", memberId: "member-a" } },
  });
  assert.equal(progress.submittedSuggestions, true);
  assert.equal(progress.submittedVotes, true);
});

test("submission progress is trip-scoped and actor-scoped", async () => {
  await prisma.trip.create({ data: trip("trip-a2", "group-a") });

  assert.equal((await submitSuggestions(request({}), tripContext("trip-a"))).status, 200);
  assert.equal((await submitVotes(request({}), tripContext("trip-a"))).status, 200);
  assert.deepEqual(
    await prisma.tripMemberProgress.findUnique({ where: { tripId_memberId: { tripId: "trip-a2", memberId: "member-a" } } }),
    null
  );

  assert.equal((await submitSuggestions(request({}), tripContext("trip-a2"))).status, 200);
  const secondTripProgress = await prisma.tripMemberProgress.findUniqueOrThrow({
    where: { tripId_memberId: { tripId: "trip-a2", memberId: "member-a" } },
  });
  assert.equal(secondTripProgress.submittedSuggestions, true);
  assert.equal(secondTripProgress.submittedVotes, false);

  setAuthenticatedMemberIdForTests("outsider");
  assert.equal((await submitSuggestions(request({}), tripContext("trip-a2"))).status, 403);
  assert.equal((await submitVotes(request({}), tripContext("trip-a2"))).status, 403);
});

test("desired vote writes are idempotent in both directions", async () => {
  const context = tripContext("trip-a");
  assert.deepEqual(await body(await toggleVote(request({ placeId: "place-a", voted: true }), context)), { ok: true, voted: true });
  assert.deepEqual(await body(await toggleVote(request({ placeId: "place-a", voted: true }), context)), { ok: true, voted: true });
  assert.equal(await prisma.vote.count({ where: { memberId: "member-a" } }), 1);
  assert.deepEqual(await body(await toggleVote(request({ placeId: "place-a", voted: false }), context)), { ok: true, voted: false });
  assert.deepEqual(await body(await toggleVote(request({ placeId: "place-a", voted: false }), context)), { ok: true, voted: false });
  assert.equal(await prisma.vote.count({ where: { memberId: "member-a" } }), 0);
});

const validTripInput = {
  groupId: "group-a",
  name: "  Tokyo Escape  ",
  destinations: [" Tokyo "],
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  budgetTotal: 2000,
  groupSize: 2,
  dailyStart: "08:00",
  dailyEnd: "22:00",
  transport: "Mixed",
};

test("trip creation validates and persists normalized input", async () => {
  const response = await createTrip(request(validTripInput));
  assert.equal(response.status, 200);
  const id = (await body(response)).id;
  assert.equal(typeof id, "string");
  const saved = await prisma.trip.findUniqueOrThrow({ where: { id: id as string } });
  assert.equal(saved.name, "Tokyo Escape");
  assert.deepEqual(JSON.parse(saved.destinationsJson), ["Tokyo"]);
  assert.equal(saved.stage, "ideas");
  assert.deepEqual(JSON.parse(saved.pricePressureJson), computeBookingPressure(validTripInput.startDate));
});

test("changing a trip start date recalculates planning urgency", async () => {
  const response = await updateTrip(request({ startDate: "2026-12-25", endDate: "2026-12-26" }), tripContext("trip-a"));
  assert.equal(response.status, 200);
  const saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.deepEqual(JSON.parse(saved.pricePressureJson), computeBookingPressure("2026-12-25"));
});

test("trip creation rejects invalid input without writing", async () => {
  const cases: Array<[Partial<typeof validTripInput>, string]> = [
    [{ startDate: "2026-02-30" }, "INVALID_DATE"],
    [{ startDate: "2026-10-03", endDate: "2026-10-02" }, "INVALID_DATE_RANGE"],
    [{ dailyStart: "25:00" }, "INVALID_TIME"],
    [{ dailyStart: "22:00", dailyEnd: "08:00" }, "INVALID_DAY_WINDOW"],
    [{ dailyStart: "08:00", dailyEnd: "08:00" }, "INVALID_DAY_WINDOW"],
    [{ budgetTotal: 199 }, "INVALID_BUDGET"],
    [{ budgetTotal: 20001 }, "INVALID_BUDGET"],
    [{ budgetTotal: "2000" as unknown as number }, "INVALID_BUDGET"],
    [{ budgetTotal: null as unknown as number }, "INVALID_BUDGET"],
    [{ groupSize: 0 }, "INVALID_GROUP_SIZE"],
    [{ groupSize: 1.5 }, "INVALID_GROUP_SIZE"],
    [{ transport: "Teleport" }, "INVALID_TRANSPORT"],
    [{ destinations: ["Tokyo", " tokyo "] }, "INVALID_REQUEST"],
  ];
  const initialCount = await prisma.trip.count();
  for (const [override, code] of cases) {
    const response = await createTrip(request({ ...validTripInput, ...override }));
    assert.equal(response.status, 400, JSON.stringify(override));
    assert.equal((await body(response)).code, code, JSON.stringify(override));
    assert.equal(await prisma.trip.count(), initialCount, JSON.stringify(override));
  }
});

const validPreferences = {
  interests: ["Food", "Culture"],
  foodPreferences: ["Local Food"],
  pace: "Balanced",
  mustDo: ["  teamLab Borderless  "],
  dislikes: ["Long queues"],
  personalBudget: 1500,
};

test("member preferences validate, normalize, and preserve the last valid value", async () => {
  const saved = await updatePreferences(request({ preferences: validPreferences }), memberContext("member-a"));
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse((await prisma.member.findUniqueOrThrow({ where: { id: "member-a" } })).preferencesJson!), {
    ...validPreferences,
    mustDo: ["teamLab Borderless"],
  });
  const baseline = (await prisma.member.findUniqueOrThrow({ where: { id: "member-a" } })).preferencesJson;
  const cases = [
    { interests: ["Unknown"] },
    { foodPreferences: ["Unknown"] },
    { pace: "Slow" },
    { mustDo: [1] },
    { mustDo: ["Same", "Same"] },
    { personalBudget: 99 },
    { personalBudget: 8001 },
  ];
  for (const override of cases) {
    const response = await updatePreferences(request({ preferences: { ...validPreferences, ...override } }), memberContext("member-a"));
    assert.equal(response.status, 400, JSON.stringify(override));
    assert.equal((await body(response)).code, "INVALID_PREFERENCES", JSON.stringify(override));
    assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: "member-a" } })).preferencesJson, baseline);
  }

  const malformed = await updatePreferences(request("{", true), memberContext("member-a"));
  assert.equal(malformed.status, 400);
  assert.equal((await body(malformed)).code, "INVALID_REQUEST");
  assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: "member-a" } })).preferencesJson, baseline);
});

test("member preference updates cannot target another actor", async () => {
  const response = await updatePreferences(request({ preferences: validPreferences }), memberContext("missing"));
  assert.equal(response.status, 403);
  const result = await body(response);
  assert.equal(result.code, "ACTOR_MISMATCH");
});

test("selected routes reject malformed and invalid shortlist input with structured errors", async () => {
  const malformed = await confirmShortlist(request("{", true), tripContext("trip-a"));
  assert.equal(malformed.status, 400);
  assert.equal((await body(malformed)).code, "INVALID_REQUEST");

  for (const capacity of ["1", 0, 21, 1.5, null]) {
    const response = await confirmShortlist(request({ capacity }), tripContext("trip-a"));
    assert.equal(response.status, 400);
  }
});

test("membership guards block outsiders on planning mutations", async () => {
  setAuthenticatedMemberIdForTests("outsider");
  const shortlist = await confirmShortlist(request({ memberId: "member-a", capacity: 1 }), tripContext("trip-a"));
  const add = await addSuggestion(request({ memberId: "member-a", placeId: "place-a" }), tripContext("trip-a"));
  const remove = await removeSuggestion(deleteRequest({ memberId: "member-a", placeId: "place-a" }), tripContext("trip-a"));
  const vote = await toggleVote(request({ memberId: "member-a", placeId: "place-a", voted: true }), tripContext("trip-a"));
  const suggestions = await submitSuggestions(request({ memberId: "member-a" }), tripContext("trip-a"));
  const votes = await submitVotes(request({ memberId: "member-a" }), tripContext("trip-a"));

  for (const response of [shortlist, add, remove, vote, suggestions, votes]) {
    assert.equal(response.status, 403);
    assert.equal((await body(response)).code, "MEMBER_NOT_IN_TRIP");
  }
});

test("suggestion add/delete stays idempotent and preserves shared TripPlaces", async () => {
  const context = tripContext("trip-a");
  assert.equal((await addSuggestion(request({ placeId: "place-a" }), context)).status, 200);
  assert.equal((await addSuggestion(request({ placeId: "place-a" }), context)).status, 200);
  setAuthenticatedMemberIdForTests("member-b");
  assert.equal((await addSuggestion(request({ placeId: "place-a" }), context)).status, 200);
  const tripPlace = await prisma.tripPlace.findUniqueOrThrow({ where: { tripId_placeId: { tripId: "trip-a", placeId: "place-a" } } });
  assert.equal(await prisma.suggestion.count({ where: { tripPlaceId: tripPlace.id } }), 2);

  setAuthenticatedMemberIdForTests("member-a");
  assert.equal((await removeSuggestion(deleteRequest({ placeId: "place-a" }), context)).status, 200);
  assert.ok(await prisma.tripPlace.findUnique({ where: { id: tripPlace.id } }));
  assert.equal(await prisma.suggestion.count({ where: { tripPlaceId: tripPlace.id } }), 1);

  setAuthenticatedMemberIdForTests("member-b");
  assert.equal((await removeSuggestion(deleteRequest({ placeId: "place-a" }), context)).status, 200);
  assert.equal(await prisma.tripPlace.findUnique({ where: { id: tripPlace.id } }), null);
  assert.equal((await removeSuggestion(deleteRequest({ placeId: "place-a" }), context)).status, 200);
});

test("group member creation persists the member and membership together", async () => {
  const response = await addGroupMember(request({ name: "New Member" }), groupContext("group-a"));
  assert.equal(response.status, 200);
  const id = (await body(response)).id as string;
  assert.equal((await prisma.member.findUniqueOrThrow({ where: { id } })).name, "New Member");
  const membership = await prisma.groupMember.findUniqueOrThrow({ where: { groupId_memberId: { groupId: "group-a", memberId: id } } });
  assert.equal(membership.role, "member");
});

test("Google place imports use server facts and fail without partial persistence", async () => {
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_PLACES_SERVER_API_KEY = "test-server-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({
    id: "provider-place",
    displayName: { text: "Server Place" },
    formattedAddress: "1 Tokyo Street",
    location: { latitude: 35.68, longitude: 139.76 },
    types: ["museum"],
    rating: 4.9,
    userRatingCount: 99,
    priceLevel: "PRICE_LEVEL_MODERATE",
    regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] },
    photos: [{ name: "places/provider-place/photos/photo-ref" }],
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    const imported = await addSuggestion(request({ googlePlaceId: "provider-place" }), tripContext("trip-a"));
    assert.equal(imported.status, 200);
    const saved = await prisma.place.findUniqueOrThrow({ where: { id: "g-provider-place" } });
    assert.equal(saved.rating, 4.9);
    assert.equal(saved.googlePlaceId, "provider-place");
    const snapshot = await body(await bootstrap()) as unknown as { places: Record<string, Place>; tripPlaces: Record<string, Record<string, Place>> };
    assert.equal(snapshot.places["g-provider-place"].photo, "/api/places/g-provider-place/photo");
    assert.equal(snapshot.tripPlaces["trip-a"]["g-provider-place"].photo, "/api/places/g-provider-place/photo");
    assert.equal((await prisma.tripPlace.findUnique({ where: { tripId_placeId: { tripId: "trip-a", placeId: "g-provider-place" } } })) !== null, true);

    setAuthenticatedMemberIdForTests("member-b");
    globalThis.fetch = (async () => { throw new Error("provider should not be called for a saved place"); }) as typeof fetch;
    assert.equal((await addSuggestion(request({ googlePlaceId: "provider-place" }), tripContext("trip-a"))).status, 200);
    setAuthenticatedMemberIdForTests("member-a");

    const forged = await addSuggestion(request({ placeId: "forged", place: { id: "forged", rating: 5, coordinates: { lat: 1, lng: 1 } } }), tripContext("trip-a"));
    assert.equal(forged.status, 400);
    assert.equal((await body(forged)).code, "INVALID_REQUEST");

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 })) as typeof fetch;
    const failed = await addSuggestion(request({ googlePlaceId: "missing-place" }), tripContext("trip-a"));
    assert.equal(failed.status, 404);
    assert.equal((await body(failed)).code, "GOOGLE_PLACE_NOT_FOUND");
    assert.equal(await prisma.place.findUnique({ where: { id: "g-missing-place" } }), null);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_PLACES_SERVER_API_KEY;
  }
});

test("Google place photos are authorized, proxied, and safely unavailable", async () => {
  await prisma.place.update({ where: { id: "place-a" }, data: { source: "google", photoRef: "places/place-a/photos/catalog-photo" } });
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  process.env.GOOGLE_PLACES_SERVER_API_KEY = "test-server-key";
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  }) as typeof fetch;

  try {
    const response = await getPlacePhoto(new Request("http://localhost"), photoContext("place-a"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/jpeg");
    assert.equal(response.headers.get("Cache-Control"), "private, max-age=3600");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);

    setAuthenticatedMemberIdForTests("outsider");
    const forbidden = await getPlacePhoto(new Request("http://localhost"), photoContext("place-a"));
    assert.equal(forbidden.status, 403);
    assert.equal(fetchCount, 1);

    setAuthenticatedMemberIdForTests("member-a");
    await prisma.place.update({ where: { id: "place-a" }, data: { source: "catalog", photoRef: null } });
    const missing = await getPlacePhoto(new Request("http://localhost"), photoContext("place-a"));
    assert.equal(missing.status, 404);

    await prisma.place.update({ where: { id: "place-a" }, data: { source: "google", photoRef: "places/place-a/photos/broken-photo" } });
    globalThis.fetch = (async () => new Response("not an image", { status: 200, headers: { "Content-Type": "text/plain" } })) as typeof fetch;
    const broken = await getPlacePhoto(new Request("http://localhost"), photoContext("place-a"));
    assert.equal(broken.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_PLACES_SERVER_API_KEY;
  }
});

test("trip split bills are shared, validated, and revision-protected", async () => {
  const empty = await getSplitBill(new Request("http://localhost"), splitBillContext("trip-a"));
  assert.equal(empty.status, 200);
  assert.deepEqual(await body(empty), { ok: true, state: null, revision: 1 });

  const state = {
    people: [{ id: "member-a", name: "Member A", items: [{ id: "item-a", name: "Dinner", price: "40", qty: "1" }] }],
    fees: {
      deliveryEnabled: false,
      deliveryAmount: "0",
      sstEnabled: true,
      serviceEnabled: false,
      discountEnabled: false,
      discountPercent: "0",
      roundingEnabled: false,
      roundingAmount: "0",
    },
  };
  const saved = await saveSplitBill(request({ state, expectedRevision: 1 }), splitBillContext("trip-a"));
  assert.equal(saved.status, 200);
  assert.equal((await body(saved)).revision, 2);

  setAuthenticatedMemberIdForTests("member-b");
  const shared = await getSplitBill(new Request("http://localhost"), splitBillContext("trip-a"));
  assert.equal(shared.status, 200);
  assert.deepEqual((await body(shared)).state, state);

  const stale = await saveSplitBill(request({ state, expectedRevision: 1 }), splitBillContext("trip-a"));
  assert.equal(stale.status, 409);
  assert.equal((await body(stale)).code, "STALE_SPLIT_BILL");

  const malformed = await saveSplitBill(request({ state: { ...state, people: [] }, expectedRevision: 2 }), splitBillContext("trip-a"));
  assert.equal(malformed.status, 400);

  setAuthenticatedMemberIdForTests("outsider");
  assert.equal((await getSplitBill(new Request("http://localhost"), splitBillContext("trip-a"))).status, 403);
  assert.equal((await saveSplitBill(request({ state, expectedRevision: 2 }), splitBillContext("trip-a"))).status, 403);
});

test("secure group invites join idempotently and rotate old tokens", async () => {
  const created = await createInvite(request({}), groupContext("group-a"));
  assert.equal(created.status, 200);
  const token = (await body(created)).token as string;
  assert.equal(token.length >= 43, true);

  await prisma.member.create({ data: { id: "invitee", name: "Invitee", initials: "I", avatarColor: "#000" } });
  setAuthenticatedMemberIdForTests("invitee");
  const joined = await joinInvite(request({}), { params: Promise.resolve({ token }) });
  assert.equal(joined.status, 200);
  assert.equal((await body(joined)).alreadyMember, false);

  const duplicate = await joinInvite(request({}), { params: Promise.resolve({ token }) });
  assert.equal(duplicate.status, 200);
  assert.equal((await body(duplicate)).alreadyMember, true);
  assert.equal(await prisma.groupMember.count({ where: { groupId: "group-a", memberId: "invitee" } }), 1);

  setAuthenticatedMemberIdForTests("member-a");
  const rotated = await createInvite(request({}), groupContext("group-a"));
  assert.equal(rotated.status, 200);
  setAuthenticatedMemberIdForTests("outsider");
  const revoked = await joinInvite(request({}), { params: Promise.resolve({ token }) });
  assert.equal(revoked.status, 404);
  assert.equal((await body(revoked)).code, "INVITE_NOT_FOUND");
});

test("single-member planning reuses consensus, itinerary, Rescue, and refreshed bootstrap state", async () => {
  await prisma.member.create({ data: { id: "solo-member", name: "Solo Traveller", initials: "S", avatarColor: "#000" } });
  await prisma.group.create({ data: { id: "solo-group", name: "Solo Group", emoji: "S", coverColor: "#000" } });
  await prisma.groupMember.create({ data: { groupId: "solo-group", memberId: "solo-member", role: "organizer" } });
  await prisma.place.createMany({ data: [
    place("solo-place-a"),
    place("solo-place-b"),
    place("solo-place-c"),
    place("solo-place-d"),
    place("solo-replacement"),
  ] });
  await prisma.trip.create({ data: { ...trip("solo-trip", "solo-group"), groupSize: 1, stage: "ideas" } });
  await prisma.tripPlace.createMany({
    data: ["solo-place-a", "solo-place-b", "solo-place-c", "solo-place-d"].map((placeId) => ({ tripId: "solo-trip", placeId })),
  });

  setAuthenticatedMemberIdForTests("solo-member");
  const preferences = await updatePreferences(
    request({ preferences: { ...validPreferences, interests: ["Culture"], foodPreferences: [], mustDo: ["solo-place-a"] } }),
    memberContext("solo-member")
  );
  assert.equal(preferences.status, 200);
  for (const placeId of ["solo-place-a", "solo-place-b", "solo-place-c", "solo-place-d"]) {
    assert.equal((await addSuggestion(request({ placeId }), tripContext("solo-trip"))).status, 200);
  }
  assert.equal((await submitSuggestions(request({}), tripContext("solo-trip"))).status, 200);

  const snapshot = await body(await bootstrap()) as unknown as {
    members: Record<string, Member>;
    places: Record<string, Place>;
    tripPlaces: Record<string, Record<string, Place>>;
    trips: Record<string, Trip>;
  };
  const consensus = buildConsensus({
    members: [snapshot.members["solo-member"]],
    candidates: Object.values(snapshot.tripPlaces["solo-trip"]),
    capacity: 2,
  });
  assert.equal(consensus.shortlist[0].candidateId, "solo-place-a");
  const shortlist = consensus.shortlist.map(({ candidateId }) => candidateId);
  const confirmed = await confirmShortlist(request({ capacity: 2, placeIds: ["not-authoritative"] }), tripContext("solo-trip"));
  assert.equal(confirmed.status, 200);
  assert.deepEqual((await body(confirmed)).shortlistPlaceIds, shortlist);
  assert.equal((await buildItinerary(request({ expectedItineraryRevision: 1 }), tripContext("solo-trip"))).status, 200);

  const built = (await body(await bootstrap())).trips as Record<string, Trip>;
  const activeActivity = built["solo-trip"].itinerary.flatMap((day) => day.activities).find((activity) => activity.placeId === "solo-place-a");
  assert.ok(activeActivity);
  await prisma.tripPlace.create({ data: { tripId: "solo-trip", placeId: "solo-replacement" } });
  await prisma.rescueEvent.create({
    data: {
      id: "solo-event",
      tripId: "solo-trip",
      type: "cancelled",
      message: "Solo activity unavailable",
      affectedActivityId: activeActivity.id,
      alternativeJson: JSON.stringify({ placeId: "solo-replacement", label: "Solo Replacement", extraTravelMinutes: 5, available: true, cost: 20, note: "Prepared alternative" }),
    },
  });
  assert.equal((await resolveRescue(request({ expectedItineraryRevision: 2 }), rescueContext("solo-trip", "solo-event"))).status, 200);

  const refreshed = (await body(await bootstrap())).trips as Record<string, Trip>;
  const activePlaceIds = refreshed["solo-trip"].itinerary.flatMap((day) => day.activities.map((activity) => activity.placeId).filter(Boolean));
  assert.equal(refreshed["solo-trip"].itineraryRevision, 3);
  assert.ok(activePlaceIds.includes("solo-replacement"));
  assert.equal(activePlaceIds.includes("solo-place-a"), false);
});

test("vote limit returns a structured error without persisting a rejected vote", async () => {
  await prisma.trip.update({ where: { id: "trip-a" }, data: { votesPerMember: 1 } });

  const first = await toggleVote(
    request({ memberId: "member-a", placeId: "place-a", voted: true }),
    tripContext("trip-a")
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await body(first), { ok: true, voted: true });

  const limited = await toggleVote(
    request({ memberId: "member-a", placeId: "place-a2", voted: true }),
    tripContext("trip-a")
  );
  assert.equal(limited.status, 400);
  const result = await body(limited);
  assert.equal(result.error, "You can only vote for up to 1 places.");
  assert.equal(result.code, "VOTE_LIMIT_REACHED");

  const voteCount = await prisma.vote.count({
    where: { memberId: "member-a", tripPlace: { tripId: "trip-a" } },
  });
  assert.equal(voteCount, 1);
});

test("shortlist is server-derived, trip-scoped, and preserves later stages", async () => {
  const invalid = await confirmShortlist(request({ memberId: "member-a", capacity: 0 }), tripContext("trip-a"));
  assert.equal(invalid.status, 400);
  assert.deepEqual(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).shortlistJson), []);

  await updatePreferences(
    request({ preferences: { ...validPreferences, mustDo: ["place-a2"] } }),
    memberContext("member-a")
  );
  await toggleVote(request({ placeId: "place-a", voted: true }), tripContext("trip-a"));
  const snapshot = await body(await bootstrap()) as unknown as {
    members: Record<string, Member>;
    tripPlaces: Record<string, Record<string, Place>>;
  };
  const expected = buildConsensus({
    members: [snapshot.members["member-a"], snapshot.members["member-b"]],
    candidates: Object.values(snapshot.tripPlaces["trip-a"]),
    capacity: 1,
  }).shortlist.map(({ candidateId }) => candidateId);
  const confirmed = await confirmShortlist(request({ memberId: "member-a", capacity: 1, placeIds: ["place-b"] }), tripContext("trip-a"));
  assert.equal(confirmed.status, 200);
  assert.deepEqual((await body(confirmed)).shortlistPlaceIds, expected);
  let saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.deepEqual(JSON.parse(saved.shortlistJson), expected);
  assert.equal(saved.stage, "validation");

  await prisma.trip.update({ where: { id: "trip-a" }, data: { stage: "itinerary" } });
  const reconfirmed = await confirmShortlist(request({ memberId: "member-a", capacity: 1 }), tripContext("trip-a"));
  assert.equal(reconfirmed.status, 200);
  saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.deepEqual(JSON.parse(saved.shortlistJson), expected);
  assert.equal(saved.stage, "itinerary");

  await prisma.vote.create({
    data: {
      tripPlaceId: (await prisma.tripPlace.findUniqueOrThrow({ where: { tripId_placeId: { tripId: "trip-b", placeId: "place-b" } } })).id,
      memberId: "outsider",
    },
  });
  const refreshed = await body(await bootstrap()) as unknown as { trips: Record<string, Trip> };
  assert.deepEqual(refreshed.trips["trip-a"].shortlistPlaceIds, expected);
});

test("itinerary build persists, is membership-scoped, and blocks rebuild", async () => {
  await confirmShortlist(request({ memberId: "member-a", capacity: 1 }), tripContext("trip-a"));
  const built = await buildItinerary(request({ memberId: "member-a", expectedItineraryRevision: 1 }), tripContext("trip-a"));
  assert.equal(built.status, 200);
  const result = await body(built);
  assert.equal(result.ok, true);
  assert.equal(result.days, 2);
  const saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.equal(saved.stage, "itinerary");
  assert.ok(JSON.parse(saved.itineraryJson).some((day: { activities: unknown[] }) => day.activities.length));

  const repeat = await buildItinerary(request({ memberId: "member-a", expectedItineraryRevision: 2 }), tripContext("trip-a"));
  assert.equal(repeat.status, 409);
  assert.equal((await body(repeat)).code, "ITINERARY_EXISTS");
});

test("stale itinerary revisions are rejected without changing the saved itinerary", async () => {
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryRevision: 2 } });
  const response = await buildItinerary(request({ expectedItineraryRevision: 1 }), tripContext("trip-a"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).code, "STALE_ITINERARY");
  assert.equal((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson, "[]");
});

test("itinerary rejects cross-trip shortlist data and leaves overflow unchanged", async () => {
  await prisma.trip.update({ where: { id: "trip-a" }, data: { shortlistJson: '["place-b"]' } });
  const crossTrip = await buildItinerary(request({ memberId: "member-a", expectedItineraryRevision: 1 }), tripContext("trip-a"));
  assert.equal(crossTrip.status, 400);
  assert.equal((await body(crossTrip)).code, "PLACE_NOT_IN_TRIP");

  await prisma.trip.update({
    where: { id: "trip-a" },
    data: { shortlistJson: '["place-a"]', dailyEnd: "09:00" },
  });
  const overflow = await buildItinerary(request({ memberId: "member-a", expectedItineraryRevision: 1 }), tripContext("trip-a"));
  assert.equal(overflow.status, 422);
  assert.equal((await body(overflow)).code, "ITINERARY_OVERFLOW");
  assert.equal((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson, "[]");
});

test("structurally invalid generated itineraries are not persisted", async () => {
  await prisma.trip.update({
    where: { id: "trip-a" },
    data: { shortlistJson: '["place-a"]', startDate: "2026-10-03", endDate: "2026-10-02" },
  });
  const response = await buildItinerary(request({ memberId: "member-a", expectedItineraryRevision: 1 }), tripContext("trip-a"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).code, "ITINERARY_INVALID");
  assert.equal((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson, "[]");
});

function rescueActivity(placeId = "place-a") {
  return {
    id: "activity-a",
    placeId,
    label: "Original",
    time: "10:00",
    durationMinutes: 90,
    travelFromPrevMinutes: 15,
    estimatedCost: 10,
    locked: true,
    type: "place",
  };
}

async function createRescueEvent(tripId: string, eventId: string, affectedActivityId = "activity-a") {
  return prisma.rescueEvent.create({
    data: {
      id: eventId,
      tripId,
      type: "cancelled",
      message: "Test rescue",
      affectedActivityId,
      alternativeJson: JSON.stringify({
        placeId: "place-a2",
        label: "Replacement",
        extraTravelMinutes: 5,
        available: true,
        cost: 20,
        note: "Test alternative",
      }),
    },
  });
}

test("Rescue atomically persists replacement, hides cross-trip events, and is idempotent", async () => {
  const itinerary = [{ day: 1, date: "2026-10-01", title: "Central", activities: [rescueActivity()] }];
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify(itinerary) } });
  await createRescueEvent("trip-a", "event-a");
  await createRescueEvent("trip-b", "event-b");

  const resolved = await resolveRescue(request({ memberId: "member-a", expectedItineraryRevision: 1 }), rescueContext("trip-a", "event-a"));
  assert.equal(resolved.status, 200);
  assert.deepEqual(await body(resolved), { ok: true, itineraryRevision: 2 });
  const saved = JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson);
  assert.deepEqual(saved[0].activities[0], { ...rescueActivity("place-a2"), label: "Replacement", estimatedCost: 20 });
  assert.equal((await prisma.rescueEvent.findUniqueOrThrow({ where: { id: "event-a" } })).status, "resolved");

  const repeated = await resolveRescue(request({ memberId: "member-a", expectedItineraryRevision: 1 }), rescueContext("trip-a", "event-a"));
  assert.equal(repeated.status, 200);
  assert.deepEqual(await body(repeated), { ok: true, alreadyResolved: true });

  const crossTrip = await resolveRescue(request({ memberId: "member-a", expectedItineraryRevision: 1 }), rescueContext("trip-a", "event-b"));
  assert.equal(crossTrip.status, 404);
  assert.equal((await body(crossTrip)).code, "RESCUE_EVENT_NOT_FOUND");
});

test("failed Rescue validation leaves itinerary and event unchanged", async () => {
  const itinerary = [{ day: 1, date: "2026-10-01", title: "Central", activities: [rescueActivity()] }];
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify(itinerary) } });
  await createRescueEvent("trip-a", "event-missing", "missing-activity");

  const response = await resolveRescue(request({ memberId: "member-a", expectedItineraryRevision: 1 }), rescueContext("trip-a", "event-missing"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).code, "AFFECTED_ACTIVITY_NOT_FOUND");
  assert.deepEqual(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson), itinerary);
  assert.equal((await prisma.rescueEvent.findUniqueOrThrow({ where: { id: "event-missing" } })).status, "open");
});

test("Plan B is trip-scoped, revision-protected, and used by Trip Rescue", async () => {
  const itinerary = [{
    day: 1,
    date: "2026-10-01",
    title: "Central",
    activities: [rescueActivity(), { ...rescueActivity(), id: "meal-a", placeId: null, type: "meal" }],
  }];
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify(itinerary) } });

  let response = await assignActivityBackup(
    request({ backupPlaceId: "place-a2", expectedItineraryRevision: 1 }),
    activityBackupContext("trip-a", "activity-a")
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true, itineraryRevision: 2 });
  assert.equal(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson)[0].activities[0].backupPlaceId, "place-a2");
  const refreshed = await body(await bootstrap()) as unknown as { trips: Record<string, Trip> };
  assert.equal(refreshed.trips["trip-a"].itinerary[0].activities[0].backupPlaceId, "place-a2");

  assert.equal((await assignActivityBackup(request({ backupPlaceId: "place-b", expectedItineraryRevision: 2 }), activityBackupContext("trip-a", "activity-a"))).status, 400);
  assert.equal((await assignActivityBackup(request({ backupPlaceId: "place-a", expectedItineraryRevision: 2 }), activityBackupContext("trip-a", "activity-a"))).status, 400);
  assert.equal((await assignActivityBackup(request({ backupPlaceId: "place-a2", expectedItineraryRevision: 2 }), activityBackupContext("trip-a", "missing"))).status, 409);
  assert.equal((await assignActivityBackup(request({ backupPlaceId: "place-a2", expectedItineraryRevision: 2 }), activityBackupContext("trip-a", "meal-a"))).status, 409);
  assert.equal((await assignActivityBackup(request({ backupPlaceId: "place-a2", expectedItineraryRevision: 1 }), activityBackupContext("trip-a", "activity-a"))).status, 409);
  setAuthenticatedMemberIdForTests("outsider");
  assert.equal((await assignActivityBackup(request({ backupPlaceId: "place-a2", expectedItineraryRevision: 2 }), activityBackupContext("trip-a", "activity-a"))).status, 403);
  setAuthenticatedMemberIdForTests("member-a");

  response = await removeActivityBackup(
    new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedItineraryRevision: 2 }) }),
    activityBackupContext("trip-a", "activity-a")
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true, itineraryRevision: 3 });
  assert.equal(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson)[0].activities[0].backupPlaceId, null);

  const withBackup = [{ day: 1, date: "2026-10-01", title: "Central", activities: [{ ...rescueActivity(), backupPlaceId: "place-a2" }] }];
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify(withBackup), itineraryRevision: 1 } });
  await createRescueEvent("trip-a", "event-plan-b");
  response = await resolveRescue(request({ expectedItineraryRevision: 1 }), rescueContext("trip-a", "event-plan-b"));
  assert.equal(response.status, 200);
  const saved = JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson);
  assert.equal(saved[0].activities[0].placeId, "place-a2");
  assert.equal(saved[0].activities[0].backupPlaceId, null);
});

test("invalid saved Plan B leaves Rescue data unchanged", async () => {
  const itinerary = [{ day: 1, date: "2026-10-01", title: "Central", activities: [{ ...rescueActivity(), backupPlaceId: "missing-place" }] }];
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify(itinerary) } });
  await createRescueEvent("trip-a", "event-invalid-plan-b");
  const response = await resolveRescue(request({ expectedItineraryRevision: 1 }), rescueContext("trip-a", "event-invalid-plan-b"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).code, "BACKUP_PLACE_NOT_FOUND");
  assert.deepEqual(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson), itinerary);
  assert.equal((await prisma.rescueEvent.findUniqueOrThrow({ where: { id: "event-invalid-plan-b" } })).status, "open");
});
