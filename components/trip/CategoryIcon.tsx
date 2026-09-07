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
  const Icon = getCategoryIcon(category);
  return (
    <div
      className={className}
      style={{ background: photo, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.22), transparent 55%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        {/* eslint-disable-next-line react-hooks/static-components -- CATEGORY_ICON values are stable module-level lucide components, not created here */}
        <Icon size={iconSize} strokeWidth={1.5} className="text-white/85" />
      </div>
    </div>
  );
}
