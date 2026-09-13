import type { TransportMode } from "./types";

export const FALLBACK_TRAVEL_MINUTES = 20;

const SPEED_KMH: Record<TransportMode, number> = {
  Walking: 4.5,
  "Public Transport": 18,
  Car: 22,
  Taxi: 24,
  Mixed: 16,
};

type Coordinates = { lat: number; lng: number };

export function isValidCoordinates({ lat, lng }: Coordinates): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

export function haversineKm(a: Coordinates, b: Coordinates): number {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return Number.NaN;
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const lat1 = a.lat * radians;
  const lat2 = b.lat * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimateTravelMinutes(a: Coordinates, b: Coordinates, transport: TransportMode): number {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return FALLBACK_TRAVEL_MINUTES;
  const distanceKm = haversineKm(a, b);
  if (!Number.isFinite(distanceKm)) return FALLBACK_TRAVEL_MINUTES;
  return Math.min(90, Math.max(10, Math.round(((distanceKm / SPEED_KMH[transport]) * 60) / 5) * 5));
}
