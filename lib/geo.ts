import type { TransportMode } from "./types";

/** Realistic average speeds, accounting for the kind of place-to-place hop this
 * app deals with — city traffic, waiting for transit, walking lights, etc. —
 * not open-road speed. */
export const SPEED_KMH: Record<TransportMode, number> = {
  Walking: 4.5,
  "Public Transport": 18,
  Car: 22,
  Taxi: 24,
  Mixed: 16,
};

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Travel time between two coordinates, rounded to the nearest 5 minutes and
 * clamped to a sane range (10 min minimum — nothing is a true zero-minute
 * hop once you account for actually leaving one place and entering another —
 * and 90 min maximum, since anything longer stops being a same-day itinerary
 * hop and becomes an inter-city transfer the trip should schedule on its own).
 */
export function travelMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  transport: TransportMode
): number {
  const km = haversineKm(a, b);
  const speed = SPEED_KMH[transport] ?? SPEED_KMH.Mixed;
  const minutes = (km / speed) * 60;
  return Math.min(90, Math.max(10, Math.round(minutes / 5) * 5));
}
