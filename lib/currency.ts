export interface Currency {
  code: string;
  name: string;
  symbol: string;
  /** Fixed reference units of this currency per 1 USD. */
  perUsd: number;
}

export const CURRENCIES = [
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
] as const satisfies readonly Currency[];

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCIES.some(({ code }) => code === value);
}

export function getCurrency(code: CurrencyCode): Currency {
  return CURRENCIES.find((currency) => currency.code === code) as Currency;
}

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  return amount * (getCurrency(to).perUsd / getCurrency(from).perUsd);
}

export function formatCurrencyAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) >= 1 ? 2 : 6,
  });
}
