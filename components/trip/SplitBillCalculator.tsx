"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Calculator, ChevronDown, Plus, Receipt, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  computeSettlement,
  fromCents,
  money,
  toCents,
  type Expense,
  type SettlementMember,
} from "@/lib/settlement";
import { cx } from "@/lib/utils";

interface ExpenseDraft {
  id: string;
  label: string;
  payerId: string;
  amount: string;
}

const AVATAR_COLORS = [
  "#E15A2A", "#0E7C74", "#7C5CE0", "#C2578B",
  "#4C7BD9", "#D8A62B", "#5C8A3A", "#D8674A",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsFor(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Who({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <span className={cx("flex min-w-0 items-center gap-2", className)}>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ backgroundColor: colorFor(id) }}
      >
        {initialsFor(name)}
      </span>
      <span className="truncate text-sm font-semibold">{name || "Unnamed"}</span>
    </span>
  );
}

export function SplitBillCalculator({
  storageKey,
  defaultNames = [],
}: {
  storageKey: string;
  defaultNames?: string[];
}) {
  const [members, setMembers] = useState<SettlementMember[]>(() => {
    const names = defaultNames.length > 0 ? defaultNames : ["Person 1", "Person 2"];
    return names.map((name) => ({ id: uid(), name }));
  });
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore / persist a work-in-progress split.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { members?: SettlementMember[]; expenses?: ExpenseDraft[] };
        if (parsed.members?.length) setMembers(parsed.members);
        if (parsed.expenses) setExpenses(parsed.expenses);
      }
    } catch {
      // ignore malformed / unavailable storage
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ members, expenses }));
    } catch {
      // ignore quota / private mode
    }
  }, [members, expenses, storageKey, hydrated]);

  function invalidate() {
    setShowResult(false);
  }

  function addMember() {
    setMembers((m) => [...m, { id: uid(), name: `Person ${m.length + 1}` }]);
    invalidate();
  }

  function removeMember(id: string) {
    setMembers((m) => (m.length > 2 ? m.filter((x) => x.id !== id) : m));
    setExpenses((e) => e.filter((x) => x.payerId !== id));
    invalidate();
  }

  function renameMember(id: string, name: string) {
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, name } : x)));
  }

  function addExpense() {
    setExpenses((e) => [
      ...e,
      { id: uid(), label: "", payerId: members[0]?.id ?? "", amount: "" },
    ]);
    invalidate();
  }

  function updateExpense(id: string, patch: Partial<ExpenseDraft>) {
    setExpenses((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    invalidate();
  }

  function removeExpense(id: string) {
    setExpenses((e) => e.filter((x) => x.id !== id));
    invalidate();
  }

  const validExpenses: Expense[] = useMemo(
    () =>
      expenses
        .filter((e) => e.payerId && members.some((m) => m.id === e.payerId) && toCents(e.amount) > 0)
        .map((e, i) => ({
          id: e.id,
          label: e.label.trim() || `Expense ${i + 1}`,
          payerId: e.payerId,
          amountCents: toCents(e.amount),
        })),
    [expenses, members]
  );

  const result = useMemo(
    () => computeSettlement(members, validExpenses),
    [members, validExpenses]
  );

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Unknown";
  const equalShare = members.length > 0 ? Math.floor(result.totalCents / members.length) : 0;

  return (
    <div className="space-y-5">
      {/* ---------------- Members ---------------- */}
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Who&apos;s splitting</h3>
          <span className="text-xs text-[var(--color-ink-soft)]">{members.length} people</span>
        </div>
        <p className="mb-4 text-xs text-[var(--color-ink-soft)]">
          Every expense below is split equally across everyone here. Remove anyone who wasn&apos;t there.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-2.5 py-2"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: colorFor(m.id) }}
              >
                {initialsFor(m.name)}
              </span>
              <input
                value={m.name}
                onChange={(e) => renameMember(m.id, e.target.value)}
                placeholder="Name"
                className="w-full min-w-0 bg-transparent text-sm font-medium outline-none"
              />
              {members.length > 2 && (
                <button
                  onClick={() => removeMember(m.id)}
                  title={`Remove ${m.name}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="mt-3" icon={<UserPlus size={14} />} onClick={addMember}>
          Add Person
        </Button>
      </Card>

      {/* ---------------- Expenses ---------------- */}
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Expenses</h3>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {validExpenses.length} counted
          </span>
        </div>
        <p className="mb-4 text-xs text-[var(--color-ink-soft)]">
          Add each bill and who actually paid it. That&apos;s all — no need to pick who shared it.
        </p>

        {expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
            <Receipt size={22} className="mx-auto text-[var(--color-ink-soft)]" />
            <p className="mt-2 text-sm font-semibold">No expenses yet</p>
            <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
              Add the first bill someone paid for the group.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_150px_120px_28px] gap-2 px-1 text-xs font-semibold text-[var(--color-ink-soft)] sm:grid">
              <span>What was it for</span>
              <span>Paid by</span>
              <span>Amount</span>
              <span />
            </div>
            {expenses.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_150px_120px_28px] sm:items-center"
              >
                <input
                  value={e.label}
                  onChange={(ev) => updateExpense(e.id, { label: ev.target.value })}
                  placeholder="e.g. Dinner at Ichiran"
                  className="col-span-2 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-sm outline-none focus:border-[var(--color-primary)] sm:col-span-1"
                />
                <select
                  value={e.payerId}
                  onChange={(ev) => updateExpense(e.id, { payerId: ev.target.value })}
                  aria-label="Paid by"
                  className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm font-medium outline-none focus:border-[var(--color-primary)]"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || "Unnamed"}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-2 focus-within:border-[var(--color-primary)]">
                  <span className="text-xs font-semibold text-[var(--color-ink-soft)]">RM</span>
                  <input
                    value={e.amount}
                    onChange={(ev) => updateExpense(e.id, { amount: ev.target.value })}
                    placeholder="0.00"
                    inputMode="decimal"
                    aria-label="Amount"
                    className="w-full min-w-0 bg-transparent text-sm font-semibold tabular-nums outline-none"
                  />
                </div>
                <button
                  onClick={() => removeExpense(e.id)}
                  title="Remove expense"
                  className="flex h-7 w-7 items-center justify-self-end rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] sm:justify-self-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="mt-3" icon={<Plus size={14} />} onClick={addExpense}>
          Add Expense
        </Button>

        {validExpenses.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-[var(--color-border-soft)] pt-3.5 text-sm">
            <span className="text-[var(--color-ink-soft)]">
              Total spent{" "}
              <strong className="ml-1 font-display text-base text-[var(--color-ink)]">
                {money(result.totalCents)}
              </strong>
            </span>
            <span className="text-[var(--color-ink-soft)]">
              Equal share ≈ <strong className="text-[var(--color-ink)]">{money(equalShare)}</strong> each
            </span>
          </div>
        )}
      </Card>

      <Button
        fullWidth
        size="lg"
        icon={<Calculator size={16} />}
        disabled={validExpenses.length === 0}
        onClick={() => setShowResult(true)}
      >
        Calculate Settlement
      </Button>

      {/* ---------------- Settlement ---------------- */}
      {showResult && validExpenses.length > 0 && (
        <div className="animate-fade-in-up space-y-4">
          <div>
            <h3 className="font-display text-lg font-bold">Settlement</h3>
            <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
              {result.settled.length === 0
                ? "Everyone's square — no transfers needed."
                : `${result.settled.length} transfer${result.settled.length > 1 ? "s" : ""} settles everything.`}
            </p>
          </div>

          {result.settled.length > 0 && (
            <Card className="divide-y divide-[var(--color-border-soft)] overflow-hidden p-0">
              {result.settled.map((t, i) => (
                <div key={i} className="flex items-center gap-3 p-3.5">
                  <Who id={t.from} name={nameOf(t.from)} className="flex-1" />
                  <span className="flex shrink-0 items-center gap-2">
                    <ArrowRight size={15} className="text-[var(--color-ink-soft)]" />
                    <span className="rounded-lg bg-[var(--color-primary-soft)] px-2.5 py-1 font-display text-sm font-bold tabular-nums text-[var(--color-primary-dark)]">
                      {money(t.amountCents)}
                    </span>
                    <ArrowRight size={15} className="text-[var(--color-ink-soft)]" />
                  </span>
                  <Who id={t.to} name={nameOf(t.to)} className="flex-1 justify-end sm:justify-start" />
                </div>
              ))}
            </Card>
          )}

          {/* Net position */}
          <Card className="p-5">
            <h4 className="mb-3 font-display text-sm font-bold">Overall position</h4>
            <div className="space-y-2">
              {members.map((m) => {
                const net = result.netByMember[m.id] ?? 0;
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <Who id={m.id} name={m.name} className="flex-1" />
                    <span
                      className={cx(
                        "text-sm font-semibold tabular-nums",
                        net > 0 && "text-[var(--color-teal)]",
                        net < 0 && "text-[var(--color-danger)]",
                        net === 0 && "text-[var(--color-ink-soft)]"
                      )}
                    >
                      {net > 0 ? `gets back ${money(net)}` : net < 0 ? `pays ${money(-net)}` : "square"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Working */}
          <Card className="overflow-hidden p-0">
            <button
              onClick={() => setShowWorking((v) => !v)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <span className="font-display text-sm font-bold">How this was worked out</span>
              <ChevronDown
                size={16}
                className={cx("transition-transform text-[var(--color-ink-soft)]", showWorking && "rotate-180")}
              />
            </button>

            {showWorking && (
              <div className="space-y-5 border-t border-[var(--color-border-soft)] p-4 text-sm">
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    1 · Each bill split on its own
                  </p>
                  <div className="space-y-3">
                    {result.perExpense.map((b) => (
                      <div key={b.expense.id} className="rounded-xl bg-[var(--color-sand)] p-3">
                        <p className="text-xs font-semibold">
                          {b.expense.label} — {nameOf(b.expense.payerId)} paid {money(b.expense.amountCents)}
                          <span className="ml-1 font-normal text-[var(--color-ink-soft)]">
                            ÷ {members.length} people
                          </span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {b.transactions.map((t, i) => (
                            <span
                              key={i}
                              className="rounded-md bg-white px-2 py-1 text-xs tabular-nums text-[var(--color-ink-soft)]"
                            >
                              {nameOf(t.from)} → {nameOf(t.to)}{" "}
                              <strong className="text-[var(--color-ink)]">{fromCents(t.amountCents)}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    2 · Same-direction debts combined
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.aggregated.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-[var(--color-sand)] px-2 py-1 text-xs tabular-nums text-[var(--color-ink-soft)]"
                      >
                        {nameOf(t.from)} → {nameOf(t.to)}{" "}
                        <strong className="text-[var(--color-ink)]">{fromCents(t.amountCents)}</strong>
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    3 · Opposite directions cancelled
                  </p>
                  {result.cancellations.length === 0 ? (
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      No pair owed each other both ways, so nothing cancelled out.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {result.cancellations.map((c, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="tabular-nums text-[var(--color-ink-soft)] line-through">
                            {nameOf(c.a)} → {nameOf(c.b)} {fromCents(c.aToB)}
                          </span>
                          <span className="text-[var(--color-ink-soft)]">and</span>
                          <span className="tabular-nums text-[var(--color-ink-soft)] line-through">
                            {nameOf(c.b)} → {nameOf(c.a)} {fromCents(c.bToA)}
                          </span>
                          <ArrowRight size={12} className="text-[var(--color-ink-soft)]" />
                          <span className="font-semibold tabular-nums">
                            {c.net
                              ? `${nameOf(c.net.from)} → ${nameOf(c.net.to)} ${fromCents(c.net.amountCents)}`
                              : "cancels out exactly"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <p className="border-t border-[var(--color-border-soft)] pt-3 text-xs text-[var(--color-ink-soft)]">
                  Amounts are held as whole cents. When a bill doesn&apos;t divide evenly, the leftover
                  cents are handed out one each rather than rounded away, so the settlement always adds
                  up to exactly {money(result.totalCents)}.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
