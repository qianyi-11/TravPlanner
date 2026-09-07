import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CURRENCY_MINOR_UNITS,
  isSupportedCurrency,
  getCurrencyMinorUnits,
  isCanonicalCurrencyCode,
  supportedCurrencyCodeSchema,
  countFractionalDigits,
  validateMonetaryPrecision,
} from "@travel-planner/shared";

describe("currencyPrecision", () => {
  describe("isCanonicalCurrencyCode & isSupportedCurrency", () => {
    it("accepts supported uppercase code", () => {
      expect(isSupportedCurrency("USD")).toBe(true);
      expect(isCanonicalCurrencyCode("USD")).toBe(true);
      expect(supportedCurrencyCodeSchema.safeParse("USD").success).toBe(true);
    });

    it("rejects lowercase code (not silently uppercased)", () => {
      expect(isSupportedCurrency("usd")).toBe(false);
      expect(isCanonicalCurrencyCode("usd")).toBe(false);
      expect(supportedCurrencyCodeSchema.safeParse("usd").success).toBe(false);
    });

    it("rejects unsupported currency code", () => {
      expect(isSupportedCurrency("XYZ")).toBe(false);
      expect(isCanonicalCurrencyCode("XYZ")).toBe(false);
      expect(supportedCurrencyCodeSchema.safeParse("XYZ").success).toBe(false);
    });

    it("returns correct minor units", () => {
      expect(getCurrencyMinorUnits("USD")).toBe(2);
      expect(getCurrencyMinorUnits("JPY")).toBe(0);
      expect(getCurrencyMinorUnits("BHD")).toBe(3);
      expect(getCurrencyMinorUnits("IDR")).toBe(2);
      expect(getCurrencyMinorUnits("XYZ")).toBeUndefined();
    });
  });

  describe("countFractionalDigits & validateMonetaryPrecision", () => {
    it("validates JPY (0 minor units)", () => {
      expect(validateMonetaryPrecision(100, "JPY")).toBe(true);
      expect(validateMonetaryPrecision(100.5, "JPY")).toBe(false);
    });

    it("validates MYR/USD (2 minor units)", () => {
      expect(validateMonetaryPrecision(0.29, "USD")).toBe(true);
      expect(validateMonetaryPrecision(10.5, "USD")).toBe(true);
      expect(validateMonetaryPrecision(10.55, "USD")).toBe(true);
      expect(validateMonetaryPrecision(0.123, "USD")).toBe(false);
      expect(validateMonetaryPrecision(0.29, "MYR")).toBe(true);
      expect(validateMonetaryPrecision(0.123, "MYR")).toBe(false);
    });

    it("validates IDR (2 minor units)", () => {
      expect(validateMonetaryPrecision(100, "IDR")).toBe(true);
      expect(validateMonetaryPrecision(100.5, "IDR")).toBe(true);
      expect(validateMonetaryPrecision(100.55, "IDR")).toBe(true);
      expect(validateMonetaryPrecision(100.555, "IDR")).toBe(false);
    });

    it("validates BHD/KWD (3 minor units)", () => {
      expect(validateMonetaryPrecision(1.234, "BHD")).toBe(true);
      expect(validateMonetaryPrecision(1.2345, "BHD")).toBe(false);
      expect(validateMonetaryPrecision(1.234, "KWD")).toBe(true);
      expect(validateMonetaryPrecision(1.2345, "KWD")).toBe(false);
    });

    it("handles 4-minor-unit currency conditionally", () => {
      if ("CLF" in SUPPORTED_CURRENCY_MINOR_UNITS) {
        expect(validateMonetaryPrecision(0.1234, "CLF")).toBe(true);
        expect(validateMonetaryPrecision(0.12345, "CLF")).toBe(false);
      }
    });

    it("handles scientific notation without decimal", () => {
      // 1e-3 = 0.001 -> 3 fractional digits
      expect(countFractionalDigits(1e-3)).toBe(3);
      expect(validateMonetaryPrecision(1e-3, "USD")).toBe(false);
    });

    it("handles scientific notation with decimals and negative/positive exponents", () => {
      // 1e-2 = 0.01 -> 2 fractional digits
      expect(countFractionalDigits(1e-2)).toBe(2);
      expect(validateMonetaryPrecision(1e-2, "USD")).toBe(true);

      // 1.23e-2 = 0.0123 -> 4 fractional digits
      expect(countFractionalDigits(1.23e-2)).toBe(4);
      expect(validateMonetaryPrecision(1.23e-2, "USD")).toBe(false);

      // 1e2 = 100 -> 0 fractional digits
      expect(countFractionalDigits(1e2)).toBe(0);
      expect(validateMonetaryPrecision(1e2, "JPY")).toBe(true);

      // 1e-1 = 0.1 -> 1 fractional digit
      expect(countFractionalDigits(1e-1)).toBe(1);
      expect(validateMonetaryPrecision(1e-1, "JPY")).toBe(false);
    });

    it("rejects non-positive and non-finite values", () => {
      expect(validateMonetaryPrecision(0, "USD")).toBe(false);
      expect(validateMonetaryPrecision(-10, "USD")).toBe(false);
      expect(validateMonetaryPrecision(NaN, "USD")).toBe(false);
      expect(validateMonetaryPrecision(Infinity, "USD")).toBe(false);
      expect(validateMonetaryPrecision(-Infinity, "USD")).toBe(false);
    });

    it("does not apply rounding", () => {
      expect(validateMonetaryPrecision(10.001, "USD")).toBe(false);
    });
  });
});
