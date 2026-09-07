import { z } from "zod";

export const SUPPORTED_CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  USD: 2,
  EUR: 2,
  GBP: 2,
  MYR: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  NZD: 2,
  THB: 2,
  HKD: 2,
  TWD: 2,
  IDR: 2,
  VND: 0,
});

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCY_MINOR_UNITS, code);
}

export function getCurrencyMinorUnits(code: string): number | undefined {
  return isSupportedCurrency(code) ? SUPPORTED_CURRENCY_MINOR_UNITS[code] : undefined;
}

export function isCanonicalCurrencyCode(code: string): boolean {
  return typeof code === "string" && code === code.toUpperCase() && isSupportedCurrency(code);
}

export const supportedCurrencyCodeSchema = z
  .string()
  .refine(isCanonicalCurrencyCode, "Unsupported or non-canonical currency");

export function countFractionalDigits(value: number): number {
  const [mantissa, exponentText] = Math.abs(value)
    .toString()
    .toLowerCase()
    .split("e");

  const exponent = exponentText ? Number(exponentText) : 0;
  const fractionLength = mantissa.split(".")[1]?.length ?? 0;

  return Math.max(0, fractionLength - exponent);
}

export function validateMonetaryPrecision(amount: number, currencyCode: string): boolean {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return false;
  }
  const minorUnits = getCurrencyMinorUnits(currencyCode);
  if (minorUnits === undefined) {
    return false;
  }
  return countFractionalDigits(amount) <= minorUnits;
}
