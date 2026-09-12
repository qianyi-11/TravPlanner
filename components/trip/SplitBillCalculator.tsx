"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Chip } from "@/components/ui/Card";
import { cx } from "@/lib/utils";
import {
  calculateSplitBill,
  DEFAULT_SPLIT_BILL_FEES,
  splitBillItemTotal,
  splitBillPersonSubtotal,
  type SplitBillFees as Fees,
  type SplitBillItem as Item,
  type SplitBillPerson as Person,
  validateSplitBill,
} from "@/lib/split-bill";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function blankItem(): Item {
  return { id: uid(), name: "", price: "", qty: "1" };
}

function blankPerson(name: string): Person {
  return { id: uid(), name, items: [blankItem()] };
}

function money(n: number): string {
  return `RM ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function defaultPeople(defaultNames: string[]): Person[] {
  const names = defaultNames.length > 0 ? defaultNames : ["Person 1", "Person 2"];
  return names.length > 0 ? names.map(blankPerson) : [blankPerson("Person 1")];
}

export function SplitBillCalculator({
  storageKey,
  defaultNames = [],
  tripId,
}: {
  storageKey: string;
  defaultNames?: string[];
  tripId?: string;
}) {
  const [people, setPeople] = useState<Person[]>(() => defaultPeople(defaultNames));
  const [fees, setFees] = useState<Fees>(() => ({ ...DEFAULT_SPLIT_BILL_FEES }));
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error" | "stale" | null>(null);
  const revision = useRef<number | null>(tripId ? null : 0);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    if (tripId) {
      let active = true;
      fetch(`/api/trips/${tripId}/split-bill`, { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as { state?: unknown; revision?: unknown };
          if (!response.ok || typeof data.revision !== "number") throw new Error("Couldn't load split bill");
          const saved = data.state === null || data.state === undefined ? null : validateSplitBill(data.state);
          if (data.state !== null && data.state !== undefined && !saved) throw new Error("Saved split bill is invalid");
          if (!active) return;
          if (saved) {
            setPeople(saved.people);
            setFees(saved.fees);
          }
          revision.current = data.revision;
          setSaveStatus("saved");
          setHydrated(true);
        })
        .catch(() => {
          if (active) {
            setSaveStatus("error");
            setHydrated(true);
          }
        });
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = validateSplitBill(JSON.parse(saved));
          if (parsed) {
            setPeople(parsed.people);
            setFees(parsed.fees);
          }
        }
      } catch {
        // ignore malformed/unavailable storage
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey, tripId]);

  useEffect(() => {
    if (!hydrated) return;
    const state = { people, fees };
    if (tripId) {
      if (revision.current === null) return;
      const timer = window.setTimeout(() => {
        saveQueue.current = saveQueue.current.then(async () => {
          setSaveStatus("saving");
          const response = await fetch(`/api/trips/${tripId}/split-bill`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, expectedRevision: revision.current }),
          });
          if (response.status === 409) {
            setSaveStatus("stale");
            return;
          }
          if (!response.ok) throw new Error("Couldn't save split bill");
          const data = (await response.json()) as { revision?: number };
          if (typeof data.revision !== "number") throw new Error("Invalid split bill response");
          revision.current = data.revision;
          setSaveStatus("saved");
        }).catch(() => setSaveStatus("error"));
      }, 400);
      return () => window.clearTimeout(timer);
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore quota/private-mode errors
    }
  }, [people, fees, storageKey, hydrated, tripId]);

  function addPerson() {
    setPeople((p) => [...p, blankPerson(`Person ${p.length + 1}`)]);
    setShowBreakdown(false);
  }
  function removePerson(id: string) {
    setPeople((p) => (p.length > 1 ? p.filter((x) => x.id !== id) : p));
    setShowBreakdown(false);
  }
  function renamePerson(id: string, name: string) {
    setPeople((p) => p.map((x) => (x.id === id ? { ...x, name } : x)));
  }
  function addItem(personId: string) {
    setPeople((p) => p.map((x) => (x.id === personId ? { ...x, items: [...x.items, blankItem()] } : x)));
    setShowBreakdown(false);
  }
  function removeItem(personId: string, itemId: string) {
    setPeople((p) =>
      p.map((x) => (x.id === personId ? { ...x, items: x.items.filter((i) => i.id !== itemId) } : x))
    );
    setShowBreakdown(false);
  }
  function updateItem(personId: string, itemId: string, patch: Partial<Item>) {
    setPeople((p) =>
      p.map((x) =>
        x.id === personId
          ? { ...x, items: x.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }
          : x
      )
    );
    setShowBreakdown(false);
  }

  const { subtotal, discountAmount, sstAmount, serviceAmount, deliveryAmount, roundingAmount, totalPaid, perPerson } = useMemo(
    () => calculateSplitBill({ people, fees }),
    [people, fees]
  );

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {people.map((person) => (
          <Card key={person.id} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <input
                value={person.name}
                onChange={(e) => renamePerson(person.id, e.target.value)}
                placeholder="Name"
                className="rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-bold font-display outline-none focus:border-[var(--color-border)] focus:bg-[var(--color-sand)]"
              />
              {people.length > 1 && (
                <button
                  onClick={() => removePerson(person.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="hidden grid-cols-[1fr_90px_70px_90px_28px] gap-2 px-1 pb-1.5 text-xs font-semibold text-[var(--color-ink-soft)] sm:grid">
              <span>Item Name</span>
              <span>Price</span>
              <span>Quantity</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            <div className="space-y-2">
              {person.items.map((item) => (
                <div key={item.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_70px_90px_28px] sm:items-center">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(person.id, item.id, { name: e.target.value })}
                    placeholder="Item name"
                    className="col-span-2 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] sm:col-span-1"
                  />
                  <input
                    value={item.price}
                    onChange={(e) => updateItem(person.id, item.id, { price: e.target.value })}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                  <input
                    value={item.qty}
                    onChange={(e) => updateItem(person.id, item.id, { qty: e.target.value })}
                    placeholder="1"
                    inputMode="numeric"
                    className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                  <span className="text-right text-sm font-semibold">{money(splitBillItemTotal(item))}</span>
                  <button
                    onClick={() => removeItem(person.id, item.id)}
                    className="flex h-7 w-7 items-center justify-self-end rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] sm:justify-self-center"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => addItem(person.id)}
                className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]"
              >
                <Plus size={14} /> Add Item
              </button>
              <span className="text-sm text-[var(--color-ink-soft)]">
                Total <span className="ml-1.5 font-display font-bold text-[var(--color-ink)]">{money(splitBillPersonSubtotal(person))}</span>
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Button variant="outline" fullWidth icon={<UserPlus size={15} />} onClick={addPerson}>
        Add Person
      </Button>
      {tripId && saveStatus && (
        <p aria-live="polite" className="text-right text-xs text-[var(--color-ink-soft)]">
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "stale" ? "This bill changed elsewhere. Refresh before saving." : "Couldn’t save this bill."}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 text-sm">
        <span className="text-[var(--color-ink-soft)]">Subtotal:</span>
        <span className="font-display text-xl font-bold">{money(subtotal)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          label="Delivery Fee"
          selected={fees.deliveryEnabled}
          onClick={() => setFees((f) => ({ ...f, deliveryEnabled: !f.deliveryEnabled }))}
        />
        <Chip label="SST Tax (10%)" selected={fees.sstEnabled} onClick={() => setFees((f) => ({ ...f, sstEnabled: !f.sstEnabled }))} />
        <Chip
          label="Service Tax (6%)"
          selected={fees.serviceEnabled}
          onClick={() => setFees((f) => ({ ...f, serviceEnabled: !f.serviceEnabled }))}
        />
        <Chip label="Discount" selected={fees.discountEnabled} onClick={() => setFees((f) => ({ ...f, discountEnabled: !f.discountEnabled }))} />
        <Chip
          label="Rounding Adjustment"
          selected={fees.roundingEnabled}
          onClick={() => setFees((f) => ({ ...f, roundingEnabled: !f.roundingEnabled }))}
        />
      </div>

      {(fees.deliveryEnabled || fees.sstEnabled || fees.serviceEnabled || fees.discountEnabled || fees.roundingEnabled) && (
        <Card className="space-y-3 p-5">
          <h3 className="text-center font-display text-sm font-bold">Additional Fees</h3>

          {fees.deliveryEnabled && (
            <FeeRow label="Delivery Fee">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--color-ink-soft)]">RM</span>
                <input
                  value={fees.deliveryAmount}
                  onChange={(e) => setFees((f) => ({ ...f, deliveryAmount: e.target.value }))}
                  inputMode="decimal"
                  className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <span className="w-20 text-right text-sm font-semibold">{money(deliveryAmount)}</span>
            </FeeRow>
          )}
          {fees.sstEnabled && (
            <FeeRow label="SST Tax">
              <span className="text-sm text-[var(--color-ink-soft)]">10%</span>
              <span className="w-20 text-right text-sm font-semibold">{money(sstAmount)}</span>
            </FeeRow>
          )}
          {fees.serviceEnabled && (
            <FeeRow label="Service Tax">
              <span className="text-sm text-[var(--color-ink-soft)]">6%</span>
              <span className="w-20 text-right text-sm font-semibold">{money(serviceAmount)}</span>
            </FeeRow>
          )}
          {fees.discountEnabled && (
            <FeeRow label="Discount">
              <div className="flex items-center gap-1.5">
                <input
                  value={fees.discountPercent}
                  onChange={(e) => setFees((f) => ({ ...f, discountPercent: e.target.value }))}
                  inputMode="decimal"
                  className="w-14 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--color-ink-soft)]">%</span>
              </div>
              <span className="w-20 text-right text-sm font-semibold text-[var(--color-danger)]">
                −{money(discountAmount)}
              </span>
            </FeeRow>
          )}
          {fees.roundingEnabled && (
            <FeeRow label="Rounding Adjustment">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--color-ink-soft)]">RM</span>
                <input
                  value={fees.roundingAmount}
                  onChange={(e) => setFees((f) => ({ ...f, roundingAmount: e.target.value }))}
                  inputMode="decimal"
                  className="w-16 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <span className="w-20 text-right text-sm font-semibold">{money(roundingAmount)}</span>
            </FeeRow>
          )}
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-[var(--color-ink-soft)]">Total Paid:</span>
        <span className="font-display text-2xl font-bold text-[var(--color-primary)]">{money(totalPaid)}</span>
      </div>

      <Button fullWidth size="lg" icon={<Calculator size={16} />} onClick={() => setShowBreakdown(true)}>
        Calculate
      </Button>

      {showBreakdown && (
        <div className="animate-fade-in-up">
          <h3 className="mb-3 font-display text-lg font-bold">Total Amount to Pay</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {perPerson.map(({ person, amount }) => (
              <Card key={person.id} className="p-4">
                <p className="truncate text-xs font-semibold text-[var(--color-ink-soft)]">{person.name || "Unnamed"}</p>
                <p className="mt-1 font-display text-xl font-bold">{money(amount)}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cx("flex items-center justify-between gap-3")}>
      <span className="text-sm font-medium text-[var(--color-ink-soft)]">{label}:</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
