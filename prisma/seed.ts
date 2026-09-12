import { PrismaClient } from "../lib/generated/prisma";
import { ALL_PLACES, GROUPS, MEMBERS, TRIPS } from "../lib/mock-data";

const prisma = new PrismaClient();

const JAPAN_CHECKLIST = [
  { id: "checklist-japan-shinkansen", title: "Reserve Shinkansen seats", assignedMemberId: "you", completed: true, createdAt: new Date("2026-09-01T09:00:00Z") },
  { id: "checklist-japan-hotel", title: "Confirm Kyoto hotel", assignedMemberId: "sarah", completed: false, createdAt: new Date("2026-09-01T09:01:00Z") },
  { id: "checklist-japan-maps", title: "Download offline maps", assignedMemberId: "jason", completed: false, createdAt: new Date("2026-09-01T09:02:00Z") },
  { id: "checklist-japan-transfer", title: "Check airport transfer", assignedMemberId: "daniel", completed: false, createdAt: new Date("2026-09-01T09:03:00Z") },
];

const JAPAN_SPLIT_BILL = {
  people: [
    { id: "you", name: "You", items: [{ id: "japan-dinner-you", name: "Izakaya dinner", price: "42", qty: "1" }] },
    { id: "sarah", name: "Sarah", items: [{ id: "japan-dinner-sarah", name: "Izakaya dinner", price: "38", qty: "1" }] },
    { id: "jason", name: "Jason", items: [{ id: "japan-dinner-jason", name: "Izakaya dinner", price: "46", qty: "1" }] },
    { id: "daniel", name: "Daniel", items: [{ id: "japan-dinner-daniel", name: "Izakaya dinner", price: "35", qty: "1" }] },
    { id: "michelle", name: "Michelle", items: [{ id: "japan-dinner-michelle", name: "Izakaya dinner", price: "40", qty: "1" }] },
    { id: "aisyah", name: "Aisyah", items: [{ id: "japan-dinner-aisyah", name: "Izakaya dinner", price: "39", qty: "1" }] },
  ],
  fees: {
    deliveryEnabled: false,
    deliveryAmount: "0.00",
    sstEnabled: false,
    serviceEnabled: false,
    discountEnabled: false,
    discountPercent: "0",
    roundingEnabled: false,
    roundingAmount: "0",
  },
};

async function main() {
  console.log("Resetting database...");
  await prisma.$transaction([
    prisma.vote.deleteMany(),
    prisma.suggestion.deleteMany(),
    prisma.tripPlace.deleteMany(),
    prisma.rescueEvent.deleteMany(),
    prisma.tripChecklistItem.deleteMany(),
    prisma.trip.deleteMany(),
    prisma.groupMember.deleteMany(),
    prisma.group.deleteMany(),
    prisma.place.deleteMany(),
    prisma.member.deleteMany(),
  ]);

  console.log("Seeding members...");
  for (const member of Object.values(MEMBERS)) {
    await prisma.member.create({
      data: {
        id: member.id,
        name: member.name,
        initials: member.initials,
        avatarColor: member.avatarColor,
        isYou: member.isYou ?? false,
        preferencesJson: member.preferences ? JSON.stringify(member.preferences) : null,
        hasSubmittedSuggestions: member.hasSubmittedSuggestions ?? false,
        hasSubmittedVotes: member.hasSubmittedVotes ?? false,
      },
    });
  }

  console.log("Seeding places...");
  for (const place of Object.values(ALL_PLACES)) {
    await prisma.place.create({
      data: {
        id: place.id,
        name: place.name,
        category: place.category,
        area: place.area,
        destination: place.destination,
        lat: place.coordinates.lat,
        lng: place.coordinates.lng,
        address: place.address,
        photo: place.photo,
        rating: place.rating,
        reviewCount: place.reviewCount,
        priceLevel: place.priceLevel,
        priceLabel: place.priceLabel,
        description: place.description,
        openingHoursJson: JSON.stringify(place.openingHours),
        isOpenNow: place.isOpenNow,
        closesAt: place.closesAt ?? null,
        estimatedDurationMinutes: place.estimatedDurationMinutes,
        reviewsJson: JSON.stringify(place.reviews),
        availability: place.availability,
        source: "catalog",
      },
    });
  }

  console.log("Seeding groups and memberships...");
  for (const group of GROUPS) {
    await prisma.group.create({
      data: {
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        coverColor: group.coverColor,
        description: group.description ?? null,
      },
    });
    for (const memberId of group.memberIds) {
      const member = MEMBERS[memberId];
      await prisma.groupMember.create({
        data: { groupId: group.id, memberId, role: member?.role ?? "member" },
      });
    }
  }

  console.log("Seeding trips, suggestions, votes and rescue events...");
  for (const trip of Object.values(TRIPS)) {
    await prisma.trip.create({
      data: {
        id: trip.id,
        groupId: trip.groupId,
        name: trip.name,
        destinationsJson: JSON.stringify(trip.destinations),
        coverColor: trip.coverColor,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budgetTotal: trip.budgetTotal,
        groupSize: trip.groupSize,
        dailyStart: trip.dailyStart,
        dailyEnd: trip.dailyEnd,
        transport: trip.transport,
        stage: trip.stage,
        shortlistJson: JSON.stringify(trip.shortlistPlaceIds),
        recommendedPlaceCount: trip.recommendedPlaceCount,
        votesPerMember: trip.votesPerMember,
        itineraryJson: JSON.stringify(trip.itinerary),
        pricePressureJson: JSON.stringify(trip.pricePressure),
        splitBillJson: trip.id === "trip-japan" ? JSON.stringify(JAPAN_SPLIT_BILL) : null,
        isLive: trip.isLive ?? false,
      },
    });

    if (trip.id === "trip-japan") {
      await prisma.tripChecklistItem.createMany({ data: JAPAN_CHECKLIST.map((item) => ({ ...item, tripId: trip.id })) });
    }

    for (const placeId of trip.placeIds) {
      const place = ALL_PLACES[placeId];
      if (!place) continue;

      const tripPlace = await prisma.tripPlace.create({
        data: { tripId: trip.id, placeId },
      });

      for (const memberId of place.suggestedBy) {
        await prisma.suggestion.create({
          data: { tripPlaceId: tripPlace.id, memberId },
        });
      }
      for (const memberId of place.votedBy) {
        await prisma.vote.create({
          data: { tripPlaceId: tripPlace.id, memberId },
        });
      }
    }

    for (const event of trip.rescueEvents) {
      await prisma.rescueEvent.create({
        data: {
          id: event.id,
          tripId: trip.id,
          type: event.type,
          message: event.message,
          affectedActivityId: event.affectedActivityId,
          status: event.status,
          alternativeJson: event.alternative ? JSON.stringify(event.alternative) : null,
          createdAt: new Date(event.createdAt),
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
