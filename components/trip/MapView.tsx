import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type MapLocation = { id: string; name: string; lat: number; lng: number };

export function MapView({ locations }: { locations: MapLocation[] }) {
  const keyAvailable = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY);
  return <Card className="overflow-hidden p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Map</h2><p className="mt-1 text-sm text-[var(--color-ink-soft)]">{keyAvailable ? "Provider map integration is ready for configured environments." : "Add a browser Maps key to enable the interactive map."}</p></div><MapPin className="text-[var(--color-primary)]" /></div>{locations.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-soft)]">No locations with coordinates yet.</p> : <div className="mt-5 grid gap-2 sm:grid-cols-2">{locations.map((location, index) => <div key={location.id} className="rounded-xl bg-[var(--color-sand)] p-3 text-sm"><span className="font-semibold">{index + 1}. {location.name}</span><span className="mt-1 block text-xs text-[var(--color-ink-soft)]">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span></div>)}</div>}</Card>;
}
