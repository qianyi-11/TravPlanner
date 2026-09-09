"use client";

import { create } from "zustand";
import type { Group, Member, MemberPreferences, Place, PlanningStage, Trip } from "./types";

interface BootstrapPayload {
  groups: Record<string, Group>;
  trips: Record<string, Trip>;
  members: Record<string, Member>;
  places: Record<string, Place>;
  currentUserId: string;
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
  currentUserId: string;
  toast: string | null;
  initialized: boolean;
  hydrating: boolean;

  hydrate: () => Promise<void>;
  switchDemoUser: (memberId: string) => Promise<boolean>;
  resetDemoUser: () => Promise<boolean>;
  showToast: (msg: string) => void;
  clearToast: () => void;

  createGroup: (input: { name: string; emoji: string; description?: string; coverColor: string }) => Promise<string>;
  addMember: (groupId: string, name: string) => Promise<void>;

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
  deleteTrip: (tripId: string) => Promise<void>;

  updateMemberPreferences: (memberId: string, prefs: MemberPreferences) => Promise<void>;

  addPlaceSuggestion: (tripId: string, placeId: string, memberId?: string) => Promise<void>;
  importAndSuggestPlace: (tripId: string, place: Place, memberId?: string) => Promise<void>;
  removePlaceSuggestion: (tripId: string, placeId: string, memberId?: string) => Promise<void>;
  submitMySuggestions: (tripId: string, memberId?: string) => Promise<void>;

  toggleVote: (tripId: string, placeId: string, memberId?: string) => Promise<boolean>;
  submitMyVotes: (tripId: string, memberId?: string) => Promise<boolean>;

  confirmShortlist: (tripId: string, placeIds: string[]) => Promise<boolean>;
  setStage: (tripId: string, stage: PlanningStage) => Promise<void>;
  advanceStage: (tripId: string) => Promise<void>;

  resolveRescue: (tripId: string, eventId: string) => Promise<boolean>;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  groups: {},
  trips: {},
  members: {},
  places: {},
  currentUserId: "",
  toast: null,
  initialized: false,
  hydrating: false,

  hydrate: async () => {
    set({ hydrating: true });
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = (await res.json()) as BootstrapPayload;
      set({ ...data, initialized: true, hydrating: false });
    } catch {
      set({ hydrating: false, toast: "Couldn't reach the server. Is it running?" });
    }
  },

  switchDemoUser: async (memberId) => {
    const result = await api("/api/demo-session", {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't switch traveller" });
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
      return;
    }
    await get().hydrate();
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
      return;
    }
    await get().hydrate();
  },

  addPlaceSuggestion: async (tripId, placeId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    const result = await api(`/api/trips/${tripId}/places`, {
      method: "POST",
      body: JSON.stringify({ placeId, memberId: mId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't add place" });
      return;
    }
    await get().hydrate();
  },

  importAndSuggestPlace: async (tripId, place, memberId) => {
    const mId = memberId ?? get().currentUserId;
    const result = await api(`/api/trips/${tripId}/places`, {
      method: "POST",
      body: JSON.stringify({ place, memberId: mId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't add place" });
      return;
    }
    await get().hydrate();
  },

  removePlaceSuggestion: async (tripId, placeId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    const result = await api(`/api/trips/${tripId}/places`, {
      method: "DELETE",
      body: JSON.stringify({ placeId, memberId: mId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't remove place" });
      return;
    }
    await get().hydrate();
  },

  submitMySuggestions: async (tripId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    const result = await api(`/api/trips/${tripId}/submit-suggestions`, {
      method: "POST",
      body: JSON.stringify({ memberId: mId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't submit suggestions" });
      return;
    }
    await get().hydrate();
  },

  toggleVote: async (tripId, placeId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    const result = await api(`/api/trips/${tripId}/votes`, {
      method: "POST",
      body: JSON.stringify({ placeId, memberId: mId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't update vote" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  submitMyVotes: async (tripId, memberId) => {
    const mId = memberId ?? get().currentUserId;
    const result = await api(`/api/trips/${tripId}/submit-votes`, {
      method: "POST",
      body: JSON.stringify({ memberId: mId }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't submit votes" });
      return false;
    }
    await get().hydrate();
    return true;
  },

  confirmShortlist: async (tripId, placeIds) => {
    const result = await api(`/api/trips/${tripId}/shortlist`, {
      method: "POST",
      body: JSON.stringify({ placeIds }),
    });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't confirm shortlist" });
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
      return;
    }
    await get().hydrate();
  },

  advanceStage: async (tripId) => {
    const result = await api(`/api/trips/${tripId}/advance-stage`, { method: "POST" });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't advance stage" });
      return;
    }
    await get().hydrate();
  },

  resolveRescue: async (tripId, eventId) => {
    const result = await api(`/api/trips/${tripId}/rescue/${eventId}/resolve`, { method: "POST" });
    if (!result.ok) {
      set({ toast: result.error ?? "Couldn't resolve this" });
      return false;
    }
    await get().hydrate();
    return true;
  },
}));
