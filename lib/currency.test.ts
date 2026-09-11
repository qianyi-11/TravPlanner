import assert from "node:assert/strict";
import test from "node:test";
import { CURRENCIES, convertCurrency, formatCurrencyAmount } from "./currency";

const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12);

test("reference cross-rates are deterministic and reversible", () => {
  assert.equal(convertCurrency(25, "MYR", "MYR"), 25);
  assert.equal(convertCurrency(10, "USD", "JPY"), 1475);
  closeTo(convertCurrency(100, "MYR", "JPY"), 100 * 147.5 / 4.19);
  closeTo(convertCurrency(convertCurrency(100, "MYR", "JPY"), "JPY", "MYR"), 100);
  closeTo(convertCurrency(1, "MYR", "JPY") * convertCurrency(1, "JPY", "MYR"), 1);
  assert.equal(convertCurrency(0, "EUR", "AED"), 0);
  assert.equal(convertCurrency(100, "MYR", "JPY"), convertCurrency(100, "MYR", "JPY"));
});

test("all 20 reference rates are valid and formatting does not alter calculations", () => {
  assert.equal(CURRENCIES.length, 20);
  assert.ok(CURRENCIES.every(({ perUsd }) => Number.isFinite(perUsd) && perUsd > 0));
  const raw = convertCurrency(1, "MYR", "EUR");
  assert.equal(formatCurrencyAmount(raw), "0.205131");
  assert.equal(raw, convertCurrency(1, "MYR", "EUR"));
  assert.equal(formatCurrencyAmount(0), "0");
});
