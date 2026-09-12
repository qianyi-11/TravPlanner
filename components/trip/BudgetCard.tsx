import { Bed, Car, Ticket, UtensilsCrossed } from "lucide-react";
import type { Trip } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { computeBudgetBreakdown, formatCurrency } from "@/lib/utils";

const CATS = [
  { key: "transportEstimate" as const, label: "Transport", icon: Car, color: "var(--color-teal)" },
  { key: "foodEstimate" as const, label: "Food", icon: UtensilsCrossed, color: "var(--color-primary)" },
  { key: "activityEstimate" as const, label: "Activities", icon: Ticket, color: "var(--color-violet)" },
];

export function BudgetCard({ trip }: { trip: Trip }) {
  const b = computeBudgetBreakdown(trip);

  return (
    <Card className="p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Known estimated spend</p>
          <p className="font-display text-3xl font-bold">{formatCurrency(b.knownEstimatedSpend)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Known per person</p>
          <p className="font-display text-lg font-bold text-[var(--color-primary)]">{formatCurrency(b.perPersonKnownSpend)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {CATS.map((c) => (
          <div key={c.key} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.color}22` }}>
              <c.icon size={14} style={{ color: c.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-ink-soft)]">{c.label}</p>
              <p className="text-sm font-bold">{b[c.key] === null ? "Unknown" : formatCurrency(b[c.key] as number)}</p>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warning-bg)]">
            <Bed size={14} className="text-[var(--color-warning)]" />
          </div>
          <div>
            <p className="text-xs text-[var(--color-ink-soft)]">Accommodation</p>
            <p className="text-sm font-bold">Unknown</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-[var(--color-sand)] px-3.5 py-2.5 text-sm">
        <span className="font-semibold">Remaining trip budget: </span>{formatCurrency(b.remainingBudget)}
        {b.unknownCostActivityCount > 0 && <span className="text-[var(--color-ink-soft)]"> · Some activity and transport costs are unknown.</span>}
      </div>
    </Card>
  );
}
