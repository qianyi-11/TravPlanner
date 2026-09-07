import { Clock, MapPin } from "lucide-react";
import type { ItineraryItem } from "@travel-planner/shared";
import { Card } from "@/components/ui/Card";

export function ActivityCard({ item }: { item: ItineraryItem }) {
  return <Card className="flex gap-3.5 p-3.5"><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sand)] text-[var(--color-ink-soft)]"><MapPin size={22} /></div><div className="min-w-0 flex-1"><p className="font-display text-sm font-bold text-[var(--color-primary)]">{item.startTime}–{item.endTime}</p><h3 className="break-words font-display text-[15px] font-bold">{item.title}</h3><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-soft)]"><span className="flex items-center gap-1"><Clock size={11} /> {item.durationMinutes} min</span>{item.location && <span className="flex items-center gap-1"><MapPin size={11} /> {item.location.name}</span>}</div></div></Card>;
}
