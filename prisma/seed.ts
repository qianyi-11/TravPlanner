import { PrismaClient } from "../lib/generated/prisma";
import { ALL_PLACES, GROUPS, MEMBERS, TRIPS } from "../lib/mock-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Resetting database...");
  await prisma.$transaction([
    prisma.vote.deleteMany(),
    prisma.suggestion.deleteMany(),
    prisma.tripPlace.deleteMany(),
    prisma.rescueEvent.deleteMany(),
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
        isLive: trip.isLive ?? false,
      },
    });

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
