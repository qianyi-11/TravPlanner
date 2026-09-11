import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { POST as resolveRescue } from "@/app/api/trips/[tripId]/rescue/[eventId]/resolve/route";
import { POST as buildItinerary } from "@/app/api/trips/[tripId]/build-itinerary/route";
import { POST as confirmShortlist } from "@/app/api/trips/[tripId]/shortlist/route";
import { DELETE as removeSuggestion, POST as addSuggestion } from "@/app/api/trips/[tripId]/places/route";
import { POST as submitSuggestions } from "@/app/api/trips/[tripId]/submit-suggestions/route";
import { POST as submitVotes } from "@/app/api/trips/[tripId]/submit-votes/route";
import { POST as toggleVote } from "@/app/api/trips/[tripId]/votes/route";
import { prisma } from "@/lib/server/prisma";

const tripContext = (tripId: string) => ({ params: Promise.resolve({ tripId }) });
const rescueContext = (tripId: string, eventId: string) => ({ params: Promise.resolve({ tripId, eventId }) });

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

beforeEach(resetFixture);
after(() => prisma.$disconnect());

test("selected routes reject malformed and invalid shortlist input with structured errors", async () => {
  const missingMember = await confirmShortlist(request({ placeIds: ["place-a"] }), tripContext("trip-a"));
  assert.equal(missingMember.status, 400);
  assert.equal((await body(missingMember)).code, "INVALID_ID");

  const malformed = await confirmShortlist(request("{", true), tripContext("trip-a"));
  assert.equal(malformed.status, 400);
  assert.equal((await body(malformed)).code, "INVALID_REQUEST");

  for (const placeIds of ["place-a", ["place-a", 1], ["place-a", "place-a"], []]) {
    const response = await confirmShortlist(request({ memberId: "member-a", placeIds }), tripContext("trip-a"));
    assert.equal(response.status, 400);
  }
});

test("membership guards block outsiders on planning mutations", async () => {
  const shortlist = await confirmShortlist(request({ memberId: "outsider", placeIds: ["place-a"] }), tripContext("trip-a"));
  const add = await addSuggestion(request({ memberId: "outsider", placeId: "place-a" }), tripContext("trip-a"));
  const remove = await removeSuggestion(deleteRequest({ memberId: "outsider", placeId: "place-a" }), tripContext("trip-a"));
  const vote = await toggleVote(request({ memberId: "outsider", placeId: "place-a" }), tripContext("trip-a"));
  const suggestions = await submitSuggestions(request({ memberId: "outsider" }), tripContext("trip-a"));
  const votes = await submitVotes(request({ memberId: "outsider" }), tripContext("trip-a"));

  for (const response of [shortlist, add, remove, vote, suggestions, votes]) {
    assert.equal(response.status, 403);
    assert.equal((await body(response)).code, "MEMBER_NOT_IN_TRIP");
  }
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
