import {
  countFractionalDigits,
  getCurrencyMinorUnits,
} from "@travel-planner/shared";

/**
 * Converts an already-normalized non-negative monetary amount to exact minor
 * units without using floating-point multiplication. Returns null when the
 * currency is unsupported or the amount exceeds that currency's precision.
 */
export function toExactMinorUnits(
  amount: number,
  currency: string,
): bigint | null {
  const minorUnits = getCurrencyMinorUnits(currency);
  if (
    minorUnits === undefined ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    countFractionalDigits(amount) > minorUnits
  ) {
    return null;
  }

  const [mantissa, exponentText] = Math.abs(amount)
    .toString()
    .toLowerCase()
    .split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const scalePower = exponent - fraction.length + minorUnits;

  // Existing precision validation should make a negative power impossible.
  // Keep the guard so this helper never rounds a value to make it fit.
  if (scalePower < 0) return null;

  return BigInt(digits) * (10n ** BigInt(scalePower));
}

export function sumExactMinorUnits(
  amounts: readonly number[],
  currency: string,
): bigint | null {
  let total = 0n;
  for (const amount of amounts) {
    const minorUnits = toExactMinorUnits(amount, currency);
    if (minorUnits === null) return null;
    total += minorUnits;
  }
  return total;
}

export function exceedsActivityBudgetCeiling(input: {
  amounts: readonly number[];
  ceiling: number;
  currency: string;
}): boolean | null {
  const totalMinorUnits = sumExactMinorUnits(input.amounts, input.currency);
  const ceilingMinorUnits = toExactMinorUnits(input.ceiling, input.currency);
  if (totalMinorUnits === null || ceilingMinorUnits === null) return null;
  return totalMinorUnits > ceilingMinorUnits;
}
