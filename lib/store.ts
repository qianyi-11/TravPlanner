"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ALL_PLACES,
  CURRENT_USER_ID,
  GROUPS,
  MEMBERS,
  TRIPS,
} from "./mock-data";
import type {
  Group,
  Member,
  MemberPreferences,
  Place,
  PlanningStage,
  Trip,
} from "./types";
import { STAGE_ORDER } from "./types";

function clone<T>(v: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

interface PlannerState {
  groups: Record<string, Group>;
  trips: Record<string, Trip>;
  members: Record<string, Member>;
  places: Record<string, Place>;
  currentUserId: string;
  toast: string | null;

  showToast: (msg: string) => void;
  clearToast: () => void;

  createGroup: (input: { name: string; emoji: string; description?: string; coverColor: string }) => string;
  addMember: (groupId: string, name: string) => void;

  createTrip: (
    groupId: string,
    input: {
      name: string;
      destinations: string[];
      startDate: string;
      endDate: string;
      budgetTotal: number;
      groupSize: number;
      dailyStart: string;
      dailyEnd: string;
      transport: Trip["transport"];
    }
  ) => string;

  updateMemberPreferences: (memberId: string, prefs: MemberPreferences) => void;

  addPlaceSuggestion: (tripId: string, placeId: string, memberId?: string) => void;
  removePlaceSuggestion: (tripId: string, placeId: string, memberId?: string) => void;
  submitMySuggestions: (tripId: string, memberId?: string) => void;

  toggleVote: (tripId: string, placeId: string, memberId?: string) => void;
  submitMyVotes: (tripId: string, memberId?: string) => void;

  confirmShortlist: (tripId: string, placeIds: string[]) => void;
  setStage: (tripId: string, stage: PlanningStage) => void;
  advanceStage: (tripId: string) => void;

  resolveRescue: (tripId: string, eventId: string) => void;
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
  groups: clone(Object.fromEntries(GROUPS.map((g) => [g.id, g]))),
  trips: clone(TRIPS),
  members: clone(MEMBERS),
  places: clone(ALL_PLACES),
  currentUserId: CURRENT_USER_ID,
  toast: null,

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  createGroup: ({ name, emoji, description, coverColor }) => {
    const id = `grp-${Date.now()}`;
    set((state) => ({
      groups: {
        ...state.groups,
        [id]: {
          id,
          name,
          emoji,
          coverColor,
          description,
          memberIds: [state.currentUserId],
          tripIds: [],
        },
      },
    }));
    return id;
  },

  addMember: (groupId, name) => {
    const id = `mem-${Date.now()}`;
    const colors = ["#D8674A", "#3E7C7B", "#8A5CF6", "#C2578B", "#4C7BD9", "#D8A62B"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    set((state) => {
      const member: Member = {
        id,
        name,
        initials: name.trim().slice(0, 1).toUpperCase() || "?",
        avatarColor: color,
        role: "member",
        hasSubmittedSuggestions: false,
        hasSubmittedVotes: false,
      };
      const group = state.groups[groupId];
      if (!group) return state;
      return {
        members: { ...state.members, [id]: member },
        groups: {
          ...state.groups,
          [groupId]: { ...group, memberIds: [...group.memberIds, id] },
        },
      };
    });
  },

  createTrip: (groupId, input) => {
    const id = `trip-${Date.now()}`;
    set((state) => {
      const group = state.groups[groupId];
      if (!group) return state;
      const trip: Trip = {
        id,
        groupId,
        name: input.name,
        destinations: input.destinations,
        coverColor: "linear-gradient(135deg,#4C7BD9,#0E7C74)",
        startDate: input.startDate,
        endDate: input.endDate,
        budgetTotal: input.budgetTotal,
        groupSize: input.groupSize,
        dailyStart: input.dailyStart,
        dailyEnd: input.dailyEnd,
        transport: input.transport,
        stage: "ideas",
        memberIds: group.memberIds,
        placeIds: [],
        shortlistPlaceIds: [],
        recommendedPlaceCount: 8,
        votesPerMember: 10,
        itinerary: [],
        pricePressure: {
          level: "LOW",
          reasons: ["Visit date is well in advance"],
          recommendation: "No rush yet",
        },
        rescueEvents: [],
      };
      return {
        trips: { ...state.trips, [id]: trip },
        groups: {
          ...state.groups,
          [groupId]: { ...group, tripIds: [...group.tripIds, id] },
        },
      };
    });
    return id;
  },

  updateMemberPreferences: (memberId, prefs) => {
    set((state) => {
      const member = state.members[memberId];
      if (!member) return state;
      return {
        members: { ...state.members, [memberId]: { ...member, preferences: prefs } },
      };
    });
  },

  addPlaceSuggestion: (tripId, placeId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    set((state) => {
      const trip = state.trips[tripId];
      const place = state.places[placeId];
      const member = state.members[mId];
      if (!trip || !place || !member) return state;
      const placeIds = trip.placeIds.includes(placeId)
        ? trip.placeIds
        : [...trip.placeIds, placeId];
      const suggestedBy = place.suggestedBy.includes(mId)
        ? place.suggestedBy
        : [...place.suggestedBy, mId];
      const suggestedPlaceIds = member.suggestedPlaceIds?.includes(placeId)
        ? member.suggestedPlaceIds
        : [...(member.suggestedPlaceIds ?? []), placeId];
      return {
        trips: { ...state.trips, [tripId]: { ...trip, placeIds } },
        places: { ...state.places, [placeId]: { ...place, suggestedBy } },
        members: { ...state.members, [mId]: { ...member, suggestedPlaceIds } },
      };
    });
  },

  removePlaceSuggestion: (tripId, placeId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    set((state) => {
      const trip = state.trips[tripId];
      const place = state.places[placeId];
      const member = state.members[mId];
      if (!trip || !place || !member) return state;
      const suggestedBy = place.suggestedBy.filter((id) => id !== mId);
      const suggestedPlaceIds = (member.suggestedPlaceIds ?? []).filter((id) => id !== placeId);
      const placeIds =
        suggestedBy.length === 0 ? trip.placeIds.filter((id) => id !== placeId) : trip.placeIds;
      return {
        trips: { ...state.trips, [tripId]: { ...trip, placeIds } },
        places: { ...state.places, [placeId]: { ...place, suggestedBy } },
        members: { ...state.members, [mId]: { ...member, suggestedPlaceIds } },
      };
    });
  },

  submitMySuggestions: (tripId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    set((state) => {
      const member = state.members[mId];
      if (!member) return state;
      return {
        members: { ...state.members, [mId]: { ...member, hasSubmittedSuggestions: true } },
      };
    });
  },

  toggleVote: (tripId, placeId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    set((state) => {
      const trip = state.trips[tripId];
      const place = state.places[placeId];
      const member = state.members[mId];
      if (!trip || !place || !member) return state;
      const currentVotes = member.votedPlaceIds ?? [];
      const votesInThisTrip = currentVotes.filter((id) => trip.placeIds.includes(id));
      const alreadyVoted = currentVotes.includes(placeId);
      if (!alreadyVoted && votesInThisTrip.length >= trip.votesPerMember) {
        return { toast: `You can only vote for up to ${trip.votesPerMember} places.` };
      }
      const votedBy = alreadyVoted
        ? place.votedBy.filter((id) => id !== mId)
        : [...place.votedBy, mId];
      const votedPlaceIds = alreadyVoted
        ? currentVotes.filter((id) => id !== placeId)
        : [...currentVotes, placeId];
      return {
        places: { ...state.places, [placeId]: { ...place, votedBy, voteCount: votedBy.length } },
        members: { ...state.members, [mId]: { ...member, votedPlaceIds } },
      };
    });
  },

  submitMyVotes: (tripId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    set((state) => {
      const member = state.members[mId];
      if (!member) return state;
      return {
        members: { ...state.members, [mId]: { ...member, hasSubmittedVotes: true } },
      };
    });
  },

  confirmShortlist: (tripId, placeIds) => {
    set((state) => {
      const trip = state.trips[tripId];
      if (!trip) return state;
      return {
        trips: {
          ...state.trips,
          [tripId]: { ...trip, shortlistPlaceIds: placeIds, stage: "validation" },
        },
      };
    });
  },

  setStage: (tripId, stage) => {
    set((state) => {
      const trip = state.trips[tripId];
      if (!trip) return state;
      return { trips: { ...state.trips, [tripId]: { ...trip, stage } } };
    });
  },

  advanceStage: (tripId) => {
    set((state) => {
      const trip = state.trips[tripId];
      if (!trip) return state;
      const idx = STAGE_ORDER.indexOf(trip.stage);
      const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
      return { trips: { ...state.trips, [tripId]: { ...trip, stage: next } } };
    });
  },

  resolveRescue: (tripId, eventId) => {
    set((state) => {
      const trip = state.trips[tripId];
      if (!trip) return state;
      const rescueEvents = trip.rescueEvents.map((e) =>
        e.id === eventId ? { ...e, status: "resolved" as const } : e
      );
      return { trips: { ...state.trips, [tripId]: { ...trip, rescueEvents } } };
    });
  },
    }),
    {
      name: "trippy-store",
      partialize: (state) => ({
        groups: state.groups,
        trips: state.trips,
        members: state.members,
        places: state.places,
        currentUserId: state.currentUserId,
      }),
    }
  )
);
