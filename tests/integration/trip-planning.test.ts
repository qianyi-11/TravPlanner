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
import { POST as updatePreferences } from "@/app/api/members/[memberId]/preferences/route";
import { POST as addGroupMember } from "@/app/api/groups/[groupId]/members/route";
import { POST as setDemoSession } from "@/app/api/demo-session/route";
import { prisma } from "@/lib/server/prisma";
import { requireTripActor, requireTripOrganizer } from "@/lib/server/authorization";
import { setAuthenticatedMemberIdForTests } from "@/lib/server/auth";
import { isDemoAuthEnabled } from "@/lib/server/demo-auth";

const tripContext = (tripId: string) => ({ params: Promise.resolve({ tripId }) });
const rescueContext = (tripId: string, eventId: string) => ({ params: Promise.resolve({ tripId, eventId }) });
const memberContext = (memberId: string) => ({ params: Promise.resolve({ memberId }) });
const groupContext = (groupId: string) => ({ params: Promise.resolve({ groupId }) });

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
    pricePressureJson: "{}",
  };
}

async function resetFixture() {
  await prisma.vote.deleteMany();
  await prisma.suggestion.deleteMany();
  await prisma.tripPlace.deleteMany();
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
  let response = await toggleVote(request({ placeId: "place-a" }), tripContext("trip-a"));
  assert.equal(response.status, 401);
  assert.equal((await body(response)).code, "UNAUTHENTICATED");

  setAuthenticatedMemberIdForTests("missing");
  response = await toggleVote(request({ placeId: "place-a" }), tripContext("trip-a"));
  assert.equal(response.status, 401);
  assert.equal((await body(response)).code, "UNAUTHENTICATED");
});

test("demo identity is disabled in production and at the test boundary", async () => {
  assert.equal(isDemoAuthEnabled({ AUTH_DEMO_ENABLED: "true", NODE_ENV: "production" }), false);
  assert.equal(isDemoAuthEnabled({ AUTH_DEMO_ENABLED: "true", NODE_ENV: "development" }), true);
  assert.equal((await setDemoSession(request({ memberId: "member-b" }))).status, 404);
});

test("client memberId cannot spoof planning identity", async () => {
  const context = tripContext("trip-a");
  assert.equal((await addSuggestion(request({ memberId: "member-b", placeId: "place-a" }), context)).status, 200);
  assert.equal((await toggleVote(request({ memberId: "member-b", placeId: "place-a" }), context)).status, 200);
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
  assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: "member-a" } })).hasSubmittedSuggestions, true);
  assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: "member-a" } })).hasSubmittedVotes, true);
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

  for (const placeIds of ["place-a", ["place-a", 1], ["place-a", "place-a"], []]) {
    const response = await confirmShortlist(request({ placeIds }), tripContext("trip-a"));
    assert.equal(response.status, 400);
  }
});

test("membership guards block outsiders on planning mutations", async () => {
  setAuthenticatedMemberIdForTests("outsider");
  const shortlist = await confirmShortlist(request({ memberId: "member-a", placeIds: ["place-a"] }), tripContext("trip-a"));
  const add = await addSuggestion(request({ memberId: "member-a", placeId: "place-a" }), tripContext("trip-a"));
  const remove = await removeSuggestion(deleteRequest({ memberId: "member-a", placeId: "place-a" }), tripContext("trip-a"));
  const vote = await toggleVote(request({ memberId: "member-a", placeId: "place-a" }), tripContext("trip-a"));
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

test("vote limit returns a structured error without persisting a rejected vote", async () => {
  await prisma.trip.update({ where: { id: "trip-a" }, data: { votesPerMember: 1 } });

  const first = await toggleVote(
    request({ memberId: "member-a", placeId: "place-a" }),
    tripContext("trip-a")
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await body(first), { ok: true, voted: true });

  const limited = await toggleVote(
    request({ memberId: "member-a", placeId: "place-a2" }),
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

test("shortlist persists exact order, preserves later stages, and rejects cross-trip places", async () => {
  const invalid = await confirmShortlist(request({ memberId: "member-a", placeIds: ["place-b"] }), tripContext("trip-a"));
  assert.equal(invalid.status, 400);
  assert.deepEqual(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).shortlistJson), []);

  const confirmed = await confirmShortlist(request({ memberId: "member-a", placeIds: ["place-a2", "place-a"] }), tripContext("trip-a"));
  assert.equal(confirmed.status, 200);
  let saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.deepEqual(JSON.parse(saved.shortlistJson), ["place-a2", "place-a"]);
  assert.equal(saved.stage, "validation");

  await prisma.trip.update({ where: { id: "trip-a" }, data: { stage: "itinerary" } });
  const reconfirmed = await confirmShortlist(request({ memberId: "member-a", placeIds: ["place-a"] }), tripContext("trip-a"));
  assert.equal(reconfirmed.status, 200);
  saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.deepEqual(JSON.parse(saved.shortlistJson), ["place-a"]);
  assert.equal(saved.stage, "itinerary");
});

test("itinerary build persists, is membership-scoped, and blocks rebuild", async () => {
  await confirmShortlist(request({ memberId: "member-a", placeIds: ["place-a"] }), tripContext("trip-a"));
  const built = await buildItinerary(request({ memberId: "member-a" }), tripContext("trip-a"));
  assert.equal(built.status, 200);
  const result = await body(built);
  assert.equal(result.ok, true);
  assert.equal(result.days, 2);
  const saved = await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } });
  assert.equal(saved.stage, "itinerary");
  assert.ok(JSON.parse(saved.itineraryJson).some((day: { activities: unknown[] }) => day.activities.length));

  const repeat = await buildItinerary(request({ memberId: "member-a" }), tripContext("trip-a"));
  assert.equal(repeat.status, 409);
  assert.equal((await body(repeat)).code, "ITINERARY_EXISTS");
});

test("itinerary rejects cross-trip shortlist data and leaves overflow unchanged", async () => {
  await prisma.trip.update({ where: { id: "trip-a" }, data: { shortlistJson: '["place-b"]' } });
  const crossTrip = await buildItinerary(request({ memberId: "member-a" }), tripContext("trip-a"));
  assert.equal(crossTrip.status, 400);
  assert.equal((await body(crossTrip)).code, "PLACE_NOT_IN_TRIP");

  await prisma.trip.update({
    where: { id: "trip-a" },
    data: { shortlistJson: '["place-a"]', dailyEnd: "09:00" },
  });
  const overflow = await buildItinerary(request({ memberId: "member-a" }), tripContext("trip-a"));
  assert.equal(overflow.status, 422);
  assert.equal((await body(overflow)).code, "ITINERARY_OVERFLOW");
  assert.equal((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson, "[]");
});

test("structurally invalid generated itineraries are not persisted", async () => {
  await prisma.trip.update({
    where: { id: "trip-a" },
    data: { shortlistJson: '["place-a"]', startDate: "2026-10-03", endDate: "2026-10-02" },
  });
  const response = await buildItinerary(request({ memberId: "member-a" }), tripContext("trip-a"));
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

  const resolved = await resolveRescue(request({ memberId: "member-a" }), rescueContext("trip-a", "event-a"));
  assert.equal(resolved.status, 200);
  assert.deepEqual(await body(resolved), { ok: true });
  const saved = JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson);
  assert.deepEqual(saved[0].activities[0], { ...rescueActivity("place-a2"), label: "Replacement", estimatedCost: 20 });
  assert.equal((await prisma.rescueEvent.findUniqueOrThrow({ where: { id: "event-a" } })).status, "resolved");

  const repeated = await resolveRescue(request({ memberId: "member-a" }), rescueContext("trip-a", "event-a"));
  assert.equal(repeated.status, 200);
  assert.deepEqual(await body(repeated), { ok: true, alreadyResolved: true });

  const crossTrip = await resolveRescue(request({ memberId: "member-a" }), rescueContext("trip-a", "event-b"));
  assert.equal(crossTrip.status, 404);
  assert.equal((await body(crossTrip)).code, "RESCUE_EVENT_NOT_FOUND");
});

test("failed Rescue validation leaves itinerary and event unchanged", async () => {
  const itinerary = [{ day: 1, date: "2026-10-01", title: "Central", activities: [rescueActivity()] }];
  await prisma.trip.update({ where: { id: "trip-a" }, data: { itineraryJson: JSON.stringify(itinerary) } });
  await createRescueEvent("trip-a", "event-missing", "missing-activity");

  const response = await resolveRescue(request({ memberId: "member-a" }), rescueContext("trip-a", "event-missing"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).code, "AFFECTED_ACTIVITY_NOT_FOUND");
  assert.deepEqual(JSON.parse((await prisma.trip.findUniqueOrThrow({ where: { id: "trip-a" } })).itineraryJson), itinerary);
  assert.equal((await prisma.rescueEvent.findUniqueOrThrow({ where: { id: "event-missing" } })).status, "open");
});
