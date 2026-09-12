import { Bed, Car, Ticket, UtensilsCrossed } from "lucide-react";
import type { Trip } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { computeBudgetBreakdown, formatCurrency } from "@/lib/utils";

const CATS = [
  { key: "transport" as const, label: "Transport", icon: Car, color: "var(--color-teal)" },
  { key: "food" as const, label: "Food", icon: UtensilsCrossed, color: "var(--color-primary)" },
  { key: "activities" as const, label: "Activities", icon: Ticket, color: "var(--color-violet)" },
  { key: "accommodation" as const, label: "Accommodation", icon: Bed, color: "var(--color-warning)" },
];

export function BudgetCard({ trip }: { trip: Trip }) {
  const b = computeBudgetBreakdown(trip);

  return (
    <Card className="p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Estimated total</p>
          <p className="font-display text-3xl font-bold">{formatCurrency(b.total)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Per person</p>
          <p className="font-display text-lg font-bold text-[var(--color-primary)]">{formatCurrency(b.perPerson)}</p>
        </div>
      </div>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-sand)]">
        {CATS.map((c) => (
          <div key={c.key} style={{ width: `${(b[c.key] / b.total) * 100}%`, backgroundColor: c.color }} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {CATS.map((c) => (
          <div key={c.key} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.color}22` }}>
              <c.icon size={14} style={{ color: c.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-ink-soft)]">{c.label}</p>
              <p className="text-sm font-bold">{formatCurrency(b[c.key])}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
