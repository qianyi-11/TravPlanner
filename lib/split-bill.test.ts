import assert from "node:assert/strict";
import test from "node:test";
import { calculateSplitBill, validateSplitBill } from "./split-bill";

const state = {
  people: [{ id: "a", name: "A", items: [{ id: "i", name: "Meal", price: "10", qty: "2" }] }],
  fees: {
    deliveryEnabled: false,
    deliveryAmount: "0",
    sstEnabled: true,
    serviceEnabled: false,
    discountEnabled: false,
    discountPercent: "0",
    roundingEnabled: false,
    roundingAmount: "0",
  },
};

test("split bill validation and calculation stay bounded and deterministic", () => {
  const valid = validateSplitBill(state);
  assert.ok(valid);
  assert.equal(calculateSplitBill(valid).totalPaid, 22);
  assert.equal(validateSplitBill({ ...state, people: [] }), null);
  assert.equal(validateSplitBill({ ...state, people: [{ ...state.people[0], items: [{ ...state.people[0].items[0], qty: "1.5" }] }] }), null);
  assert.equal(validateSplitBill({ ...state, fees: { ...state.fees, discountPercent: "101" } }), null);
});
