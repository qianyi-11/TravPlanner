"use client";

import { create } from "zustand";
import type { Group, Member, MemberPreferences, Place, PlanningStage, Trip, TripMemberProgress } from "./types";

interface BootstrapPayload {
  groups: Record<string, Group>;
  trips: Record<string, Trip>;
  members: Record<string, Member>;
  places: Record<string, Place>;
  tripPlaces: Record<string, Record<string, Place>>;
  tripMemberProgress: Record<string, Record<string, TripMemberProgress>>;
  currentUserId: string;
  demoAuthEnabled: boolean;
}

async function api(url: string, init?: RequestInit): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? "Something went wrong" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Network error — check your connection and try again." };
  }
}

interface PlannerState {
  groups: Record<string, Group>;
  trips: Record<string, Trip>;
  members: Record<string, Member>;
  places: Record<string, Place>;
  tripPlaces: Record<string, Record<string, Place>>;
  tripMemberProgress: Record<string, Record<string, TripMemberProgress>>;
  currentUserId: string;
  toast: string | null;
  initialized: boolean;
  hydrating: boolean;
  authRequired: boolean;
  demoAuthEnabled: boolean;

  hydrate: () => Promise<void>;
  startDemoSession: () => Promise<boolean>;
  resetDemoUser: () => Promise<boolean>;
  showToast: (msg: string) => void;
  clearToast: () => void;

  createGroup: (input: { name: string; emoji: string; description?: string; coverColor: string }) => Promise<string>;
  renameGroup: (groupId: string, name: string) => Promise<boolean>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  createGroupInvite: (groupId: string) => Promise<string>;
  addMember: (groupId: string, name: string) => Promise<boolean>;

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
  ) => Promise<string>;
  renameTrip: (tripId: string, name: string) => Promise<boolean>;
  updateTripDetails: (tripId: string, updates: Partial<Pick<Trip, "startDate" | "endDate" | "budgetTotal" | "dailyStart" | "dailyEnd" | "transport">>) => Promise<boolean>;
  deleteTrip: (tripId: string) => Promise<void>;

  updateMemberPreferences: (memberId: string, prefs: MemberPreferences) => Promise<boolean>;

  addPlaceSuggestion: (tripId: string, placeId: string) => Promise<void>;
  removePlaceSuggestion: (tripId: string, placeId: string) => Promise<void>;
  submitMySuggestions: (tripId: string) => Promise<boolean>;

  setVote: (tripId: string, placeId: string, voted: boolean) => Promise<boolean>;
  submitMyVotes: (tripId: string) => Promise<boolean>;

  confirmShortlist: (tripId: string, capacity: number) => Promise<boolean>;
  buildItinerary: (tripId: string) => Promise<boolean>;
  setStage: (tripId: string, stage: PlanningStage) => Promise<boolean>;

  resolveRescue: (tripId: string, eventId: string) => Promise<boolean>;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  groups: {},
  trips: {},
  members: {},
  places: {},
  tripPlaces: {},
  tripMemberProgress: {},
  currentUserId: "",
  toast: null,
  initialized: false,
  hydrating: false,
  authRequired: false,
  demoAuthEnabled: false,

  hydrate: async () => {
    set({ hydrating: true });
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<BootstrapPayload> & { error?: string };
      if (!res.ok) {
        if (res.status === 401) set({ initialized: true, hydrating: false, authRequired: true });
        else set({ initialized: true, hydrating: false, toast: data.error ?? "Couldn't load your trips" });
        return;
      }
      set({ ...data as BootstrapPayload, initialized: true, hydrating: false, authRequired: false });
    } catch {
      set({ initialized: true, hydrating: false, toast: "Couldn't reach the server. Is it running?" });
    }
  },

  startDemoSession: async () => {
    const result = await api("/api/demo-session", {
      method: "POST",
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't open competition demo" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  resetDemoUser: async () => {
    const result = await api("/api/demo-session", { method: "DELETE" });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't reset demo session" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  createGroup: async ({ name, emoji, description, coverColor }) => {
    const result = await api("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name, emoji, description, coverColor }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't create group" });
      throw new Error(result.error);
    }
    await get().hydrate();
    return result.id as string;
  },

  addMember: async (groupId, name) => {
    const result = await api(`/api/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't add member" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  renameGroup: async (groupId, name) => {
    const result = await api(`/api/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't rename group" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  deleteGroup: async (groupId) => {
    const result = await api(`/api/groups/${groupId}`, { method: "DELETE" });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't delete group" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  createGroupInvite: async (groupId) => {
    const result = await api(`/api/groups/${groupId}/invite`, { method: "POST", body: JSON.stringify({}) });
    if (!result.ok || typeof result.token !== "string") {
      set({ toast: result.error ?? "Couldn't create invite" });
      throw new Error(result.error ?? "Couldn't create invite");
    }
    return result.token;
  },

  createTrip: async (groupId, input) => {
    const result = await api("/api/trips", {
      method: "POST",
      body: JSON.stringify({ groupId, ...input }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't create trip" });
      throw new Error(result.error);
    }
    await get().hydrate();
    return result.id as string;
  },

  deleteTrip: async (tripId) => {
    const result = await api(`/api/trips/${tripId}`, { method: "DELETE" });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't delete trip" });
      return;
    }
    await get().hydrate();
  },

  updateMemberPreferences: async (memberId, prefs) => {
    const result = await api(`/api/members/${memberId}/preferences`, {
      method: "POST",
      body: JSON.stringify({ preferences: prefs }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't save preferences" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  addPlaceSuggestion: async (tripId, placeId) => {
    const result = await api(`/api/trips/${tripId}/places`, {
      method: "POST",
      body: JSON.stringify({ placeId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't add place" });
      return;
    }
    await get().hydrate();
  },

  removePlaceSuggestion: async (tripId, placeId) => {
    const result = await api(`/api/trips/${tripId}/places`, {
      method: "DELETE",
      body: JSON.stringify({ placeId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't remove place" });
      return;
    }
    await get().hydrate();
  },

  submitMySuggestions: async (tripId) => {
    const result = await api(`/api/trips/${tripId}/submit-suggestions`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't submit suggestions" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  renameTrip: async (tripId, name) => {
    const result = await api(`/api/trips/${tripId}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't rename trip" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  updateTripDetails: async (tripId, updates) => {
    const result = await api(`/api/trips/${tripId}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't update trip details" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  setVote: async (tripId, placeId, voted) => {
    const result = await api(`/api/trips/${tripId}/votes`, {
      method: "POST",
      body: JSON.stringify({ placeId, voted }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't update vote" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  submitMyVotes: async (tripId) => {
    const result = await api(`/api/trips/${tripId}/submit-votes`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't submit votes" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  confirmShortlist: async (tripId, capacity) => {
    const result = await api(`/api/trips/${tripId}/shortlist`, {
      method: "POST",
      body: JSON.stringify({ capacity }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't confirm shortlist" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  buildItinerary: async (tripId) => {
    const expectedItineraryRevision = get().trips[tripId]?.itineraryRevision;
    if (!expectedItineraryRevision) {
      set({ toast: "Couldn't read the current itinerary version" });
      return false;
    }
    const result = await api(`/api/trips/${tripId}/build-itinerary`, {
      method: "POST",
      body: JSON.stringify({ expectedItineraryRevision }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't build itinerary" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  setStage: async (tripId, stage) => {
    const result = await api(`/api/trips/${tripId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't update stage" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  resolveRescue: async (tripId, eventId) => {
    const expectedItineraryRevision = get().trips[tripId]?.itineraryRevision;
    if (!expectedItineraryRevision) {
      set({ toast: "Couldn't read the current itinerary version" });
      return false;
    }
    const result = await api(`/api/trips/${tripId}/rescue/${eventId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ expectedItineraryRevision }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't resolve this" });
      return false;
    }
    await get().hydrate();
    return true;
  },
}));
