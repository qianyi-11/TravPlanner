"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface Currency {
  code: string;
  name: string;
  symbol: string;
  /** Units of this currency per 1 USD. Cross-rates are derived from this. */
  perUsd: number;
}

/**
 * Fixed reference rates used for trip budgeting — not a live market feed.
 * Everything converts through USD, so every pair stays internally consistent
 * and swapping a pair gives the exact inverse.
 */
const CURRENCIES: Currency[] = [
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", perUsd: 4.19 },
  { code: "USD", name: "US Dollar", symbol: "$", perUsd: 1 },
  { code: "EUR", name: "Euro", symbol: "€", perUsd: 0.8595 },
  { code: "GBP", name: "British Pound", symbol: "£", perUsd: 0.745 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", perUsd: 147.5 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", perUsd: 1.28 },
  { code: "THB", name: "Thai Baht", symbol: "฿", perUsd: 32.4 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", perUsd: 16350 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", perUsd: 25800 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", perUsd: 57.2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", perUsd: 1355 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", perUsd: 7.12 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", perUsd: 7.79 },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", perUsd: 31.5 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", perUsd: 87.6 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", perUsd: 1.5 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", perUsd: 1.64 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", perUsd: 1.37 },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr", perUsd: 0.8 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", perUsd: 3.67 },
];

const BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c])) as Record<string, Currency>;

const QUICK_FROM = ["MYR", "SGD", "USD"];
const QUICK_TO = ["JPY", "USD", "EUR"];

const STORAGE_KEY = "trippy-converter-pair";

function convert(amount: number, from: Currency, to: Currency): number {
  return amount * (to.perUsd / from.perUsd);
}

function format(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  const decimals = Math.abs(value) >= 1 ? 2 : 6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Math.abs(value) >= 1 ? 2 : 2,
    maximumFractionDigits: decimals,
  });
}

export function CurrencyConverter() {
  const [fromCode, setFromCode] = useState("MYR");
  const [toCode, setToCode] = useState("JPY");
  const [amount, setAmount] = useState("100");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { from, to } = JSON.parse(saved) as { from: string; to: string };
        if (BY_CODE[from]) setFromCode(from);
        if (BY_CODE[to]) setToCode(to);
      }
    } catch {
      // ignore unavailable storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ from: fromCode, to: toCode }));
    } catch {
      // ignore quota / private mode
    }
  }, [fromCode, toCode, hydrated]);

  const from = BY_CODE[fromCode];
  const to = BY_CODE[toCode];
  const parsed = parseFloat(amount);
  const numericAmount = Number.isFinite(parsed) ? parsed : 0;
  const result = convert(numericAmount, from, to);
  const unitRate = convert(1, from, to);
  const inverseRate = convert(1, to, from);

  function swap() {
    setFromCode(toCode);
    setToCode(fromCode);
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
          {/* ---- From ---- */}
          <div className="space-y-3">
            <CurrencySelect label="From" value={fromCode} onChange={setFromCode} />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-ink-soft)]">Amount</label>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-3 focus-within:border-[var(--color-primary)]">
                <span className="shrink-0 text-sm font-semibold text-[var(--color-ink-soft)]">{from.symbol}</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount in ${from.code}`}
                  className="w-full min-w-0 bg-transparent font-display text-2xl font-bold tabular-nums outline-none"
                />
              </div>
            </div>
            <QuickPicks codes={QUICK_FROM} active={fromCode} onPick={setFromCode} />
          </div>

          {/* ---- Swap ---- */}
          <div className="flex justify-center sm:pt-9">
            <button
              onClick={swap}
              title="Swap currencies"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-teal)] shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--color-teal-soft)] active:scale-95"
            >
              <ArrowLeftRight size={17} />
            </button>
          </div>

          {/* ---- To ---- */}
          <div className="space-y-3">
            <CurrencySelect label="To" value={toCode} onChange={setToCode} />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-ink-soft)]">Converted</label>
              <div className="flex items-center gap-2 rounded-xl border border-transparent bg-[var(--color-sand)] px-3.5 py-3">
                <span className="shrink-0 text-sm font-semibold text-[var(--color-ink-soft)]">{to.symbol}</span>
                <p className="min-w-0 flex-1 truncate font-display text-2xl font-bold tabular-nums text-[var(--color-primary)]">
                  {format(result)}
                </p>
              </div>
            </div>
            <QuickPicks codes={QUICK_TO} active={toCode} onPick={setToCode} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--color-border-soft)] pt-4 text-sm">
          <span className="font-semibold">
            1 {from.code} = <span className="tabular-nums">{format(unitRate)}</span> {to.code}
          </span>
          <span className="text-[var(--color-ink-soft)]">
            1 {to.code} = <span className="tabular-nums">{format(inverseRate)}</span> {from.code}
          </span>
        </div>
      </Card>

      <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-sand)] px-4 py-3">
        <Info size={15} className="mt-0.5 shrink-0 text-[var(--color-ink-soft)]" />
        <p className="text-xs text-[var(--color-ink-soft)]">
          Indicative rates for budgeting your trip — these are fixed reference values, not a live market
          feed. Check with your bank or a live source before exchanging money.
        </p>
      </div>
    </div>
  );
}

function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const currency = BY_CODE[value];
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[var(--color-ink-soft)]">{label}</label>
      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 focus-within:border-[var(--color-primary)]">
        <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-sand)] text-sm font-bold">
          {currency.symbol}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full min-w-0 cursor-pointer bg-transparent text-sm font-semibold outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function QuickPicks({
  codes,
  active,
  onPick,
}: {
  codes: string[];
  active: string;
  onPick: (code: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((code) => (
        <button
          key={code}
          onClick={() => onPick(code)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
            active === code
              ? "bg-[var(--color-ink)] text-white"
              : "bg-[var(--color-sand)] text-[var(--color-ink-soft)] hover:bg-[var(--color-border)]"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
