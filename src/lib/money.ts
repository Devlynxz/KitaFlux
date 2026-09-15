/**
 * Money.
 *
 * Every amount in KitaFlux passes through here. The rules, once, so they are
 * not re-decided per call site:
 *
 * 1. No `number` ever holds an amount. Input arrives as a string from a form or
 *    a Prisma Decimal from the database; it becomes a `Decimal` immediately and
 *    stays one until it is formatted for display.
 *
 * 2. Rounding is ROUND_HALF_UP, always. Not banker's rounding. Philippine
 *    invoicing and BIR practice round half away from zero, and a freelancer
 *    reconciling this against a bank statement should never see a figure that
 *    disagrees with what they would get on paper.
 *
 * 3. Rounding happens at exactly four points, and nowhere else:
 *      - a line amount            round(quantity x unitPrice, 2)
 *      - a tax amount             round(subtotal x taxRate, 2)
 *      - a net received amount    amountReceived - feeAmount   (both already 2dp)
 *      - a converted amount       round(net x fxRate, 2)
 *    A subtotal is the sum of already-rounded line amounts, so it needs no
 *    rounding of its own. This is the "round each line, then sum" convention,
 *    which is what every invoice a client has ever received does. Summing raw
 *    products and rounding once at the end would produce totals that do not
 *    equal the visible column, and clients query that.
 *
 * 4. FX rates carry 10 decimal places and are never rounded before use. Only
 *    the product of a conversion is rounded.
 */
import { Decimal } from "decimal.js";

// 28 significant digits is far beyond what Decimal(20,2) columns can hold, so
// intermediate products never lose precision before the explicit rounding step.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});

export { Decimal };

/** Anything that can safely become a Decimal. Note: `number` is not included. */
export type MoneyInput = string | Decimal | { toString(): string };

/** Decimal places used for storage and display, per currency. */
const CURRENCY_SCALE: Record<string, number> = {
  USD: 2,
  PHP: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
  CAD: 2,
  SGD: 2,
  JPY: 0,
};

export const SUPPORTED_CURRENCIES = [
  "USD",
  "PHP",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "SGD",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Scale for a currency code, defaulting to 2 for anything unlisted. */
export function scaleFor(currency: string): number {
  return CURRENCY_SCALE[currency.toUpperCase()] ?? 2;
}

/**
 * Coerce untrusted input to a Decimal.
 *
 * Empty string and null become zero, which is what a blank optional money field
 * on a form means. Anything non-numeric throws rather than silently becoming
 * NaN and poisoning a total downstream.
 */
export function toDecimal(value: MoneyInput | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;

  const raw = typeof value === "string" ? value : value.toString();
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") return new Decimal(0);

  let parsed: Decimal;
  try {
    parsed = new Decimal(trimmed);
  } catch {
    throw new Error(`Not a valid amount: ${raw}`);
  }
  if (!parsed.isFinite()) throw new Error(`Not a finite amount: ${raw}`);
  return parsed;
}

/** Round to a currency's scale, half up. The only rounding primitive. */
export function round(value: MoneyInput, currency: string): Decimal {
  return toDecimal(value).toDecimalPlaces(scaleFor(currency), Decimal.ROUND_HALF_UP);
}

/** A single invoice line: round(quantity x unitPrice). */
export function lineAmount(
  quantity: MoneyInput,
  unitPrice: MoneyInput,
  currency: string,
): Decimal {
  return round(toDecimal(quantity).times(toDecimal(unitPrice)), currency);
}

/** Sum of already-rounded line amounts. No further rounding by design. */
export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));
}

export interface InvoiceTotals {
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

/**
 * Totals for an invoice.
 *
 * `taxRate` is a fraction, not a percentage: 12% VAT is "0.12". Tax is applied
 * to the subtotal as a whole rather than per line, because a per-line tax that
 * is rounded per line does not sum to the tax a client computes from the
 * subtotal, and that discrepancy is the single most common invoice dispute.
 */
export function invoiceTotals(
  lines: Array<{ quantity: MoneyInput; unitPrice: MoneyInput }>,
  taxRate: MoneyInput,
  currency: string,
): InvoiceTotals {
  const amounts = lines.map((l) => lineAmount(l.quantity, l.unitPrice, currency));
  const subtotal = sum(amounts);
  const taxAmount = round(subtotal.times(toDecimal(taxRate)), currency);
  return { subtotal, taxAmount, total: subtotal.plus(taxAmount) };
}

/** Formatting for storage: a plain fixed-scale string, never exponent notation. */
export function toStorage(value: MoneyInput, currency: string): string {
  return round(value, currency).toFixed(scaleFor(currency));
}

/** Formatting for an FX rate column: fixed 10dp, no rounding of significance. */
export function rateToStorage(value: MoneyInput): string {
  return toDecimal(value).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed(10);
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  PHP: "₱",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  JPY: "¥",
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOL[currency.toUpperCase()] ?? "";
}

/**
 * Display an amount with thousands separators at the currency's scale.
 * `withCode` appends the ISO code, which matters whenever two currencies share
 * a screen -- "$1,200.00" and "P68,400.00" next to each other are ambiguous
 * without it.
 */
export function formatMoney(
  value: MoneyInput,
  currency: string,
  opts: { withCode?: boolean; withSymbol?: boolean } = {},
): string {
  const { withCode = false, withSymbol = true } = opts;
  const scale = scaleFor(currency);
  const rounded = round(value, currency);
  const negative = rounded.isNegative();
  const [whole, fraction] = rounded.abs().toFixed(scale).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const body = fraction ? `${grouped}.${fraction}` : grouped;
  const symbol = withSymbol ? currencySymbol(currency) : "";
  const code = withCode ? ` ${currency.toUpperCase()}` : "";
  return `${negative ? "-" : ""}${symbol}${body}${code}`;
}

/** Rates are shown at 4dp: enough to see the day's movement, not noise. */
export function formatRate(value: MoneyInput): string {
  return toDecimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

export function isZero(value: MoneyInput): boolean {
  return toDecimal(value).isZero();
}

export function isPositive(value: MoneyInput): boolean {
  return toDecimal(value).greaterThan(0);
}

export function isNegative(value: MoneyInput): boolean {
  return toDecimal(value).isNegative();
}
