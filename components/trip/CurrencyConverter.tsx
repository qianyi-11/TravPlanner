"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  CURRENCIES,
  convertCurrency,
  formatCurrencyAmount,
  getCurrency,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";

const STORAGE_KEY = "trippy-converter-pair";
const QUICK_FROM: CurrencyCode[] = ["MYR", "SGD", "USD"];
const QUICK_TO: CurrencyCode[] = ["JPY", "USD", "EUR"];

export function CurrencyConverter() {
  const [from, setFrom] = useState<CurrencyCode>("MYR");
  const [to, setTo] = useState<CurrencyCode>("JPY");
  const [amount, setAmount] = useState("100");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved: { from?: string; to?: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { from?: string; to?: string } | null;
    } catch {
      // Browser storage is optional for this utility.
    }
    queueMicrotask(() => {
      if (saved?.from && isCurrencyCode(saved.from)) setFrom(saved.from);
      if (saved?.to && isCurrencyCode(saved.to)) setTo(saved.to);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
    } catch {
      // Browser storage is optional for this utility.
    }
  }, [from, to, hydrated]);

  const source = getCurrency(from);
  const target = getCurrency(to);
  const parsedAmount = Number.parseFloat(amount);
  const numericAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
          <div className="space-y-3">
            <CurrencySelect label="From" value={from} onChange={setFrom} />
            <label className="block text-xs font-semibold text-[var(--color-ink-soft)]">
              Amount
              <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-3 focus-within:border-[var(--color-primary)]">
                <span className="text-sm">{source.symbol}</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  aria-label={`Amount in ${from}`}
                  className="w-full min-w-0 bg-transparent font-display text-2xl font-bold tabular-nums outline-none"
                />
              </span>
            </label>
            <QuickPicks codes={QUICK_FROM} active={from} onPick={setFrom} />
          </div>

          <div className="flex justify-center sm:pt-9">
            <button
              type="button"
              onClick={() => { setFrom(to); setTo(from); }}
              aria-label="Swap currencies"
              title="Swap currencies"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-teal)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-teal-soft)]"
            >
              <ArrowLeftRight size={17} />
            </button>
          </div>

          <div className="space-y-3">
            <CurrencySelect label="To" value={to} onChange={setTo} />
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">Converted</p>
              <div className="flex items-center gap-2 rounded-xl bg-[var(--color-sand)] px-3.5 py-3">
                <span className="text-sm">{target.symbol}</span>
                <p className="min-w-0 flex-1 truncate font-display text-2xl font-bold tabular-nums text-[var(--color-primary)]">
                  {formatCurrencyAmount(convertCurrency(numericAmount, from, to))}
                </p>
              </div>
            </div>
            <QuickPicks codes={QUICK_TO} active={to} onPick={setTo} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--color-border-soft)] pt-4 text-sm">
          <span className="font-semibold">1 {from} = {formatCurrencyAmount(convertCurrency(1, from, to))} {to}</span>
          <span className="text-[var(--color-ink-soft)]">1 {to} = {formatCurrencyAmount(convertCurrency(1, to, from))} {from}</span>
        </div>
      </Card>

      <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-sand)] px-4 py-3">
        <Info size={15} className="mt-0.5 shrink-0 text-[var(--color-ink-soft)]" />
        <p className="text-xs text-[var(--color-ink-soft)]">
          Estimated conversion using fixed reference rates. Not a live market feed; check a live source before exchanging money.
        </p>
      </div>
    </div>
  );
}

function CurrencySelect({ label, value, onChange }: { label: string; value: CurrencyCode; onChange: (code: CurrencyCode) => void }) {
  const currency = getCurrency(value);
  return (
    <label className="block text-xs font-semibold text-[var(--color-ink-soft)]">
      {label}
      <span className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 focus-within:border-[var(--color-primary)]">
        <span className="flex h-8 w-11 items-center justify-center rounded-lg bg-[var(--color-sand)] text-sm font-bold">{currency.symbol}</span>
        <select
          value={value}
          onChange={(event) => isCurrencyCode(event.target.value) && onChange(event.target.value)}
          aria-label={label}
          className="w-full min-w-0 cursor-pointer bg-transparent text-sm font-semibold outline-none"
        >
          {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
        </select>
      </span>
    </label>
  );
}

function QuickPicks({ codes, active, onPick }: { codes: CurrencyCode[]; active: CurrencyCode; onPick: (code: CurrencyCode) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onPick(code)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${active === code ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-sand)] text-[var(--color-ink-soft)] hover:bg-[var(--color-border)]"}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
