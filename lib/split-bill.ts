export interface SplitBillItem {
  id: string;
  name: string;
  price: string;
  qty: string;
}

export interface SplitBillPerson {
  id: string;
  name: string;
  items: SplitBillItem[];
}

export interface SplitBillFees {
  deliveryEnabled: boolean;
  deliveryAmount: string;
  sstEnabled: boolean;
  serviceEnabled: boolean;
  discountEnabled: boolean;
  discountPercent: string;
  roundingEnabled: boolean;
  roundingAmount: string;
}

export interface SplitBillState {
  people: SplitBillPerson[];
  fees: SplitBillFees;
}

export const DEFAULT_SPLIT_BILL_FEES: SplitBillFees = {
  deliveryEnabled: false,
  deliveryAmount: "0.00",
  sstEnabled: false,
  serviceEnabled: false,
  discountEnabled: false,
  discountPercent: "0",
  roundingEnabled: false,
  roundingAmount: "0",
};

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function numericString(value: unknown, { integer = false, min = 0, max = 100_000 } = {}): value is string {
  if (!boundedString(value, 32)) return false;
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed));
}

export function validateSplitBill(value: unknown): SplitBillState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as { people?: unknown; fees?: unknown };
  if (!Array.isArray(input.people) || input.people.length < 1 || input.people.length > 20) return null;
  if (input.fees === null || typeof input.fees !== "object" || Array.isArray(input.fees)) return null;

  const ids = new Set<string>();
  const people: SplitBillPerson[] = [];
  for (const personValue of input.people) {
    if (personValue === null || typeof personValue !== "object" || Array.isArray(personValue)) return null;
    const person = personValue as { id?: unknown; name?: unknown; items?: unknown };
    if (!boundedString(person.id, 80) || !person.id || ids.has(person.id) || !boundedString(person.name, 120)) return null;
    if (!Array.isArray(person.items) || person.items.length > 50) return null;
    ids.add(person.id);
    const items: SplitBillItem[] = [];
    const itemIds = new Set<string>();
    for (const itemValue of person.items) {
      if (itemValue === null || typeof itemValue !== "object" || Array.isArray(itemValue)) return null;
      const item = itemValue as { id?: unknown; name?: unknown; price?: unknown; qty?: unknown };
      if (!boundedString(item.id, 80) || !item.id || itemIds.has(item.id) || !boundedString(item.name, 120)) return null;
      if (!numericString(item.price) || !numericString(item.qty, { integer: true, max: 10_000 })) return null;
      itemIds.add(item.id);
      items.push({ id: item.id, name: item.name, price: item.price, qty: item.qty });
    }
    people.push({ id: person.id, name: person.name, items });
  }

  const fees = input.fees as Record<string, unknown>;
  const booleanKeys = ["deliveryEnabled", "sstEnabled", "serviceEnabled", "discountEnabled", "roundingEnabled"];
  if (booleanKeys.some((key) => typeof fees[key] !== "boolean")) return null;
  if (!numericString(fees.deliveryAmount) || !numericString(fees.discountPercent, { max: 100 }) || !numericString(fees.roundingAmount, { min: -100_000 })) return null;
  return {
    people,
    fees: {
      deliveryEnabled: fees.deliveryEnabled as boolean,
      deliveryAmount: fees.deliveryAmount as string,
      sstEnabled: fees.sstEnabled as boolean,
      serviceEnabled: fees.serviceEnabled as boolean,
      discountEnabled: fees.discountEnabled as boolean,
      discountPercent: fees.discountPercent as string,
      roundingEnabled: fees.roundingEnabled as boolean,
      roundingAmount: fees.roundingAmount as string,
    },
  };
}

export function validateSplitBillRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function numberValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function splitBillItemTotal(item: SplitBillItem): number {
  return numberValue(item.price) * (Number.parseInt(item.qty, 10) || 0);
}

export function splitBillPersonSubtotal(person: SplitBillPerson): number {
  return person.items.reduce((sum, item) => sum + splitBillItemTotal(item), 0);
}

export function calculateSplitBill(state: SplitBillState) {
  const { people, fees } = state;
  const subtotal = people.reduce((sum, person) => sum + splitBillPersonSubtotal(person), 0);
  const discountAmount = fees.discountEnabled ? subtotal * (numberValue(fees.discountPercent) / 100) : 0;
  const taxable = Math.max(0, subtotal - discountAmount);
  const sstAmount = fees.sstEnabled ? taxable * 0.1 : 0;
  const serviceAmount = fees.serviceEnabled ? taxable * 0.06 : 0;
  const deliveryAmount = fees.deliveryEnabled ? numberValue(fees.deliveryAmount) : 0;
  const roundingAmount = fees.roundingEnabled ? numberValue(fees.roundingAmount) : 0;
  const totalPaid = taxable + sstAmount + serviceAmount + deliveryAmount + roundingAmount;
  const perPerson = people.map((person) => {
    const personTotal = splitBillPersonSubtotal(person);
    const share = subtotal > 0 ? personTotal / subtotal : 1 / people.length;
    return { person, subtotal: personTotal, amount: totalPaid * share };
  });
  return { subtotal, discountAmount, taxable, sstAmount, serviceAmount, deliveryAmount, roundingAmount, totalPaid, perPerson };
}
