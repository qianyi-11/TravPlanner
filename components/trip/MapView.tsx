"use client";

import { useMemo } from "react";
import type { Place } from "@/lib/types";

const W = 420;
const H = 320;
const PAD = 36;

export function MapView({
  places,
  selectedId,
  onSelect,
  showRoute = true,
}: {
  places: Place[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showRoute?: boolean;
}) {
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
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)]" style={{ background: "linear-gradient(180deg,#EFF3EE,#E9EFEA)" }}>
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
