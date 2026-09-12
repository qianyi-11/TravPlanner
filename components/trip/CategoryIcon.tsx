"use client";

import { useState } from "react";
import {
  Building2,
  Castle,
  Coffee,
  Flower2,
  Landmark,
  MapPin,
  Mountain,
  Music,
  Palette,
  ShoppingBag,
  Ticket,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { gradientFor } from "@/lib/utils";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Temple: Landmark,
  Shrine: Landmark,
  Market: ShoppingBag,
  "Food Market": UtensilsCrossed,
  Park: Trees,
  Nature: Trees,
  Landmark: MapPin,
  "Shopping Street": ShoppingBag,
  "Shopping District": ShoppingBag,
  "Shopping Mall": ShoppingBag,
  "Cafe District": Coffee,
  Garden: Flower2,
  "Observation Deck": Building2,
  "Observation Tower": Building2,
  "Digital Art Museum": Palette,
  Ramen: UtensilsCrossed,
  "Historic District": Landmark,
  Castle: Castle,
  "Entertainment District": Music,
  "Theme Park": Ticket,
};

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category] ?? Mountain;
}

function isRealPhotoUrl(photo: string): boolean {
  return photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/api/");
}

export function PlaceCover({
  photo,
  category,
  className,
  iconSize = 34,
}: {
  photo: string;
  category: string;
  className?: string;
  iconSize?: number;
}) {
  const [broken, setBroken] = useState(false);
  const Icon = getCategoryIcon(category);
  const useRealPhoto = isRealPhotoUrl(photo) && !broken;
  const gradient = useRealPhoto ? undefined : isRealPhotoUrl(photo) ? gradientFor(photo) : photo;

  return (
    <div className={className} style={{ background: gradient, position: "relative", overflow: "hidden" }}>
      {useRealPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Google photo URL, not a static asset
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.22), transparent 55%)",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {/* eslint-disable-next-line react-hooks/static-components -- CATEGORY_ICON values are stable module-level lucide components, not created here */}
            <Icon size={iconSize} strokeWidth={1.5} className="text-white/85" />
          </div>
        </>
      )}
    </div>
  );
}
