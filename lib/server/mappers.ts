import type {
  Group as PGroup,
  Member as PMember,
  Place as PPlace,
  RescueEvent as PRescueEvent,
  Suggestion as PSuggestion,
  Trip as PTrip,
  TripPlace as PTripPlace,
  Vote as PVote,
} from "@/lib/generated/prisma";
import type {
  Group,
  ItineraryDay,
  Member,
  MemberPreferences,
  Place,
  PricePressure,
  Trip,
  TripRescueEvent,
} from "@/lib/types";

export function mapGroup(
  row: PGroup & { members: { memberId: string }[]; trips: { id: string }[] }
): Group {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    coverColor: row.coverColor,
    description: row.description ?? undefined,
    memberIds: row.members.map((m) => m.memberId),
    tripIds: row.trips.map((t) => t.id),
  };
}

export function mapMember(
  row: PMember,
  ctx: { suggestedPlaceIds: string[]; votedPlaceIds: string[]; role?: string }
): Member {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    avatarColor: row.avatarColor,
    isYou: row.isYou,
    role: (ctx.role as Member["role"]) ?? "member",
    preferences: row.preferencesJson ? (JSON.parse(row.preferencesJson) as MemberPreferences) : undefined,
    suggestedPlaceIds: ctx.suggestedPlaceIds,
    votedPlaceIds: ctx.votedPlaceIds,
    hasSubmittedSuggestions: row.hasSubmittedSuggestions,
    hasSubmittedVotes: row.hasSubmittedVotes,
  };
}

function basePlaceFields(row: PPlace) {
  return {
    id: row.id,
    source: row.source as Place["source"],
    name: row.name,
    category: row.category,
    area: row.area,
    destination: row.destination,
    coordinates: { lat: row.lat, lng: row.lng },
    address: row.address,
    photo: row.photo,
    rating: row.rating,
    reviewCount: row.reviewCount,
    priceLevel: row.priceLevel as Place["priceLevel"],
    priceLabel: row.priceLabel,
    description: row.description,
    openingHours: JSON.parse(row.openingHoursJson),
    isOpenNow: row.isOpenNow,
    closesAt: row.closesAt ?? undefined,
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    reviews: JSON.parse(row.reviewsJson),
    availability: row.availability as Place["availability"],
  };
}

type TripPlaceWithJoins = PTripPlace & { suggestions: PSuggestion[]; votes: PVote[] };

/** Aggregates a place's suggestions/votes across every trip it currently appears in. */
export function mapCatalogPlace(row: PPlace & { tripPlaces: TripPlaceWithJoins[] }): Place {
  const allSuggestions = row.tripPlaces.flatMap((tp) => tp.suggestions);
  const allVotes = row.tripPlaces.flatMap((tp) => tp.votes);
  const votedBy = Array.from(new Set(allVotes.map((v) => v.memberId)));
  return {
    ...basePlaceFields(row),
    suggestedBy: Array.from(new Set(allSuggestions.map((s) => s.memberId))),
    voteCount: votedBy.length,
    votedBy,
  };
}

function mapRescueEvent(row: PRescueEvent): TripRescueEvent {
  return {
    id: row.id,
    type: row.type as TripRescueEvent["type"],
    message: row.message,
    affectedActivityId: row.affectedActivityId,
    createdAt: row.createdAt.toISOString(),
    status: row.status as TripRescueEvent["status"],
    alternative: row.alternativeJson ? JSON.parse(row.alternativeJson) : undefined,
  };
}

export function mapTrip(
  row: PTrip & {
    tripPlaces: { placeId: string }[];
    rescueEvents: PRescueEvent[];
  },
  memberIds: string[]
): Trip {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    destinations: JSON.parse(row.destinationsJson),
    coverColor: row.coverColor,
    startDate: row.startDate,
    endDate: row.endDate,
    budgetTotal: row.budgetTotal,
    groupSize: row.groupSize,
    dailyStart: row.dailyStart,
    dailyEnd: row.dailyEnd,
    transport: row.transport as Trip["transport"],
    stage: row.stage as Trip["stage"],
    memberIds,
    placeIds: row.tripPlaces.map((tp) => tp.placeId),
    shortlistPlaceIds: JSON.parse(row.shortlistJson),
    recommendedPlaceCount: row.recommendedPlaceCount,
    votesPerMember: row.votesPerMember,
    itinerary: JSON.parse(row.itineraryJson) as ItineraryDay[],
    pricePressure: JSON.parse(row.pricePressureJson) as PricePressure,
    rescueEvents: row.rescueEvents.map(mapRescueEvent),
    isLive: row.isLive,
  };
}
