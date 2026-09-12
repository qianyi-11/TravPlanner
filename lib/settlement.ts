/**
 * Group expense settlement.
 *
 * The rule this implements, deliberately, is:
 *   1. Every expense is split equally across ALL members.
 *   2. Each bill is recorded on its own as debts owed TO the payer
 *      (the payer never owes themselves).
 *   3. Same-direction debts are aggregated.
 *   4. Opposite-direction debts between the same two people cancel out,
 *      leaving one net transfer per pair.
 *
 * This is NOT a net-balance / greedy "who owes the pot" algorithm — the
 * per-bill relationships are built first and only then collapsed, so the
 * working can be shown and verified step by step.
 *
 * Money is integer cents throughout. Splitting uses largest-remainder
 * distribution so a split never creates or destroys a cent.
 */

export interface SettlementMember {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  label: string;
  payerId: string;
  amountCents: number;
}

export interface Transaction {
  from: string;
  to: string;
  amountCents: number;
}

export interface Share {
  memberId: string;
  shareCents: number;
}

export interface ExpenseBreakdown {
  expense: Expense;
  shares: Share[];
  transactions: Transaction[];
}

export interface Cancellation {
  a: string;
  b: string;
  aToB: number;
  bToA: number;
  /** Surviving transfer after cancelling, or null when they cancel exactly. */
  net: Transaction | null;
}

export interface SettlementResult {
  /** Stage 1 — each bill on its own. */
  perExpense: ExpenseBreakdown[];
  /** Stage 2 — same-direction debts combined. */
  aggregated: Transaction[];
  /** Stage 3 — pairs that had debts flowing both ways. */
  cancellations: Cancellation[];
  /** Final simplified settlement. */
  settled: Transaction[];
  totalCents: number;
  /** Positive = is owed money overall, negative = owes money overall. */
  netByMember: Record<string, number>;
}

/**
 * Split `totalCents` across `memberIds` with no cent lost.
 *
 * floor() every share, then hand the leftover cents out one each. `rotation`
 * shifts who receives them so the same members don't always carry the extra
 * cent across a long list of expenses.
 */
export function splitEqually(totalCents: number, memberIds: string[], rotation = 0): Share[] {
  const n = memberIds.length;
  if (n === 0) return [];

  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;

  const shares: Share[] = memberIds.map((id) => ({ memberId: id, shareCents: base }));
  for (let k = 0; k < remainder; k++) {
    shares[(rotation + k) % n].shareCents += 1;
  }
  return shares;
}

function edgeKey(from: string, to: string) {
  return `${from}|${to}`;
}

export function computeSettlement(
  members: SettlementMember[],
  expenses: Expense[]
): SettlementResult {
  const memberIds = members.map((m) => m.id);
  const indexOf = new Map(memberIds.map((id, i) => [id, i]));

  // ---- Stage 1: every bill recorded separately -------------------------
  const perExpense: ExpenseBreakdown[] = expenses.map((expense, i) => {
    const shares = splitEqually(expense.amountCents, memberIds, i);
    const transactions: Transaction[] = shares
      .filter((s) => s.memberId !== expense.payerId) // nobody pays themselves
      .filter((s) => s.shareCents > 0)
      .map((s) => ({ from: s.memberId, to: expense.payerId, amountCents: s.shareCents }));
    return { expense, shares, transactions };
  });

  // ---- Stage 2: aggregate same-direction debts -------------------------
  const edges = new Map<string, number>();
  for (const { transactions } of perExpense) {
    for (const t of transactions) {
      const key = edgeKey(t.from, t.to);
      edges.set(key, (edges.get(key) ?? 0) + t.amountCents);
    }
  }

  const aggregated: Transaction[] = [...edges.entries()].map(([key, amountCents]) => {
    const [from, to] = key.split("|");
    return { from, to, amountCents };
  });

  // ---- Stage 3: cancel opposite directions, pair by pair ---------------
  const cancellations: Cancellation[] = [];
  const settled: Transaction[] = [];

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];
      const aToB = edges.get(edgeKey(a, b)) ?? 0;
      const bToA = edges.get(edgeKey(b, a)) ?? 0;
      if (aToB === 0 && bToA === 0) continue;

      const net = aToB - bToA;
      let survivor: Transaction | null = null;
      if (net > 0) survivor = { from: a, to: b, amountCents: net };
      else if (net < 0) survivor = { from: b, to: a, amountCents: -net };

      // Only a genuine two-way pair counts as a cancellation worth showing.
      if (aToB > 0 && bToA > 0) {
        cancellations.push({ a, b, aToB, bToA, net: survivor });
      }
      if (survivor) settled.push(survivor);
    }
  }

  settled.sort((x, y) => {
    const byPayer = (indexOf.get(x.from) ?? 0) - (indexOf.get(y.from) ?? 0);
    if (byPayer !== 0) return byPayer;
    return (indexOf.get(x.to) ?? 0) - (indexOf.get(y.to) ?? 0);
  });

  // ---- Overall position per member ------------------------------------
  const netByMember: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));
  for (const { expense, shares } of perExpense) {
    netByMember[expense.payerId] = (netByMember[expense.payerId] ?? 0) + expense.amountCents;
    for (const s of shares) {
      netByMember[s.memberId] = (netByMember[s.memberId] ?? 0) - s.shareCents;
    }
  }

  return {
    perExpense,
    aggregated,
    cancellations,
    settled,
    totalCents: expenses.reduce((sum, e) => sum + e.amountCents, 0),
    netByMember,
  };
}

// ---- money helpers -----------------------------------------------------

export function toCents(input: string): number {
  const n = parseFloat(input);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function money(cents: number): string {
  return `RM ${fromCents(cents)}`;
}
