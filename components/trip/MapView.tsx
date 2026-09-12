"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

interface MapViewProps {
  places: Place[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showRoute?: boolean;
}

export function MapView(props: MapViewProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // Silently fall back to the offline map below — no key, blocked network, quota, etc.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-2xl border border-[var(--color-border)]">
      {ready ? <LiveGoogleMap {...props} /> : <MockMap {...props} />}
    </div>
  );
}

function makeMarkerIcon(index: number, selected: boolean): google.maps.Icon {
  const color = selected ? "#E15A2A" : "#1C1B19";
  const r = selected ? 13 : 11;
  const size = r * 2 + 4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="white" stroke-width="2"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
    labelOrigin: new google.maps.Point(size / 2, size / 2),
  };
}

function LiveGoogleMap({ places, selectedId, onSelect, showRoute = true }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      styles: MAP_STYLE,
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextIds = new Set(places.map((p) => p.id));
    for (const [id, marker] of markersRef.current) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    const bounds = new google.maps.LatLngBounds();
    places.forEach((place, i) => {
      const pos = { lat: place.coordinates.lat, lng: place.coordinates.lng };
      bounds.extend(pos);
      let marker = markersRef.current.get(place.id);
      if (!marker) {
        marker = new google.maps.Marker({ position: pos, map, title: place.name });
        marker.addListener("click", () => onSelectRef.current?.(place.id));
        markersRef.current.set(place.id, marker);
      } else {
        marker.setPosition(pos);
      }
      const selected = place.id === selectedId;
      marker.setIcon(makeMarkerIcon(i + 1, selected));
      marker.setLabel({ text: String(i + 1), color: "white", fontSize: "11px", fontWeight: "700" });
      marker.setZIndex(selected ? 999 : i);
    });

    if (showRoute && places.length > 1) {
      const path = places.map((p) => ({ lat: p.coordinates.lat, lng: p.coordinates.lng }));
      if (!polylineRef.current) {
        polylineRef.current = new google.maps.Polyline({
          path,
          map,
          strokeColor: "#0E7C74",
          strokeOpacity: 0.85,
          strokeWeight: 3,
        });
      } else {
        polylineRef.current.setPath(path);
        polylineRef.current.setMap(map);
      }
    } else {
      polylineRef.current?.setMap(null);
    }

    if (places.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(15);
    } else if (places.length > 1) {
      map.fitBounds(bounds, 48);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, showRoute]);

  useEffect(() => {
    places.forEach((place, i) => {
      const marker = markersRef.current.get(place.id);
      if (!marker) return;
      const selected = place.id === selectedId;
      marker.setIcon(makeMarkerIcon(i + 1, selected));
      marker.setZIndex(selected ? 999 : i);
    });
    if (selectedId) {
      const p = places.find((pl) => pl.id === selectedId);
      if (p && mapRef.current) mapRef.current.panTo({ lat: p.coordinates.lat, lng: p.coordinates.lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full" style={{ minHeight: 280 }} />;
}

const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#F3EDE2" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8A8578" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FBF8F3" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#DCEFEC" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#F0EAE0" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

// ---------------------------------------------------------------------------
// Offline fallback — a hand-drawn SVG mock, used until Maps JS loads (or if it
// can't: no key, blocked network, quota exceeded).
// ---------------------------------------------------------------------------

const W = 420;
const H = 320;
const PAD = 36;

function MockMap({ places, selectedId, onSelect, showRoute = true }: MapViewProps) {
  const points = useMemo(() => {
    if (places.length === 0) return [];
    const lats = places.map((p) => p.coordinates.lat);
    const lngs = places.map((p) => p.coordinates.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    return places.map((p) => {
      const x = PAD + ((p.coordinates.lng - minLng) / lngRange) * (W - PAD * 2);
      const y = H - PAD - ((p.coordinates.lat - minLat) / latRange) * (H - PAD * 2);
      return { place: p, x, y };
    });
  }, [places]);

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div
      className="h-full w-full"
      style={{ background: "linear-gradient(180deg,#EFF3EE,#E9EFEA)" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" style={{ minHeight: 280 }}>
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(90,110,90,0.08)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />

        {showRoute && points.length > 1 && (
          <path d={pathD} fill="none" stroke="var(--color-teal)" strokeWidth={2.5} strokeDasharray="1 8" strokeLinecap="round" />
        )}

        {points.map(({ place, x, y }, i) => {
          const isSelected = selectedId === place.id;
          return (
            <g
              key={place.id}
              transform={`translate(${x}, ${y})`}
              onClick={() => onSelect?.(place.id)}
              className={onSelect ? "cursor-pointer" : ""}
            >
              {isSelected && <circle r={16} fill="var(--color-primary)" opacity={0.18} />}
              <circle
                r={isSelected ? 11 : 9}
                fill={isSelected ? "var(--color-primary)" : "var(--color-ink)"}
                stroke="white"
                strokeWidth={2}
              />
              <text
                textAnchor="middle"
                dy="3.5"
                fontSize="10"
                fontWeight={700}
                fill="white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {i + 1}
              </text>
              {isSelected && (
                <text y={-18} textAnchor="middle" fontSize="11" fontWeight={700} fill="var(--color-ink)">
                  {place.name.length > 22 ? place.name.slice(0, 20) + "…" : place.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
