import { Wallet } from "lucide-react";
import type { ActivityBudgetRead } from "@travel-planner/shared";
import { Card } from "@/components/ui/Card";

export function BudgetCard({ budget, currency }: { budget: ActivityBudgetRead | null | undefined; currency: string }) {
  return <Card className="p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"><Wallet size={18} /></div><div><p className="text-xs font-semibold text-[var(--color-ink-soft)]">My activity budget</p><p className="font-display text-2xl font-bold">{budget ? `${budget.amount.toFixed(2)} ${budget.currency}` : "Not set"}</p></div></div><p className="mt-4 text-sm text-[var(--color-ink-soft)]">{budget ? `Recorded for planning cycle ${budget.planningCycleUpdated}.` : `Set a personal activity budget in ${currency}.`}</p></Card>;
}
