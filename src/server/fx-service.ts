import { Decimal, rateToStorage, toDecimal } from "@/lib/money";
import { addDays, toDateInputValue, toUtcDate, todayUtc } from "@/lib/dates";

import { prisma } from "./db";

/**
 * FX rate lookup, with a date-keyed cache.
 *
 * The cache is not a performance optimisation -- it is a correctness
 * requirement. A rate row, once written for a given date, is never updated. A
 * quarterly report re-run in December must produce the identical peso figures
 * it produced in March, because those figures were filed.
 *
 * Providers:
 *   frankfurter  - ECB reference rates, keyless, historical back to 1999.
 *                  The default, so the app works with no credentials at all.
 *   exchangerate.host - the spec's first choice. Now requires an access key,
 *                  so it is opt-in via EXCHANGERATE_HOST_ACCESS_KEY.
 *
 * Both quote ECB-style mid-market rates. Neither is what a bank actually gives
 * a freelancer, which is why the payment form always allows a manual override
 * and marks the source. The fetched rate is a sensible default, not the truth.
 */

export type FxSource = "cache" | "frankfurter" | "exchangerate.host" | "manual";

export interface RateLookup {
  rate: Decimal;
  /** Date requested. */
  date: Date;
  /** Business day the provider actually priced. Differs on weekends/holidays. */
  quoteDate: Date;
  source: FxSource;
}

export class FxUnavailableError extends Error {
  constructor(base: string, quote: string, date: Date) {
    super(
      `No exchange rate available for ${base}/${quote} on ${toDateInputValue(date)}. ` +
        `Enter the rate your bank gave you instead.`,
    );
    this.name = "FxUnavailableError";
  }
}

/**
 * How long Next may reuse a provider response. A past date's answer is
 * immutable, so a day is safe. A recent date's answer can still change (today
 * before the ECB publishes returns yesterday's rate), so it is kept for an hour
 * -- the same three-day window in which getRate declines to cache a fallback.
 */
function revalidateFor(date: Date): number {
  return date.getTime() >= addDays(todayUtc(), -3).getTime() ? 60 * 60 : 60 * 60 * 24;
}

interface ProviderResult {
  rate: Decimal;
  quoteDate: Date;
  source: FxSource;
}

async function fetchFrankfurter(
  base: string,
  quote: string,
  date: Date,
): Promise<ProviderResult | null> {
  const day = toDateInputValue(date);
  const url = `https://api.frankfurter.dev/v1/${day}?base=${base}&symbols=${quote}`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: revalidateFor(date) },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const raw = body.rates?.[quote];
  if (raw === undefined) return null;

  return {
    // The provider hands back a JSON number. It is stringified immediately and
    // never used as a number in any arithmetic.
    rate: toDecimal(String(raw)),
    quoteDate: body.date ? toUtcDate(body.date) : toUtcDate(date),
    source: "frankfurter",
  };
}

async function fetchExchangerateHost(
  base: string,
  quote: string,
  date: Date,
): Promise<ProviderResult | null> {
  const key = process.env.EXCHANGERATE_HOST_ACCESS_KEY;
  if (!key) return null;

  const day = toDateInputValue(date);
  const url =
    `https://api.exchangerate.host/historical?access_key=${key}` +
    `&date=${day}&source=${base}&currencies=${quote}&format=1`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: revalidateFor(date) },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    success?: boolean;
    date?: string;
    quotes?: Record<string, number>;
  };
  if (!body.success) return null;

  // exchangerate.host keys quotes as the concatenated pair, e.g. "USDPHP".
  const raw = body.quotes?.[`${base}${quote}`];
  if (raw === undefined) return null;

  return {
    rate: toDecimal(String(raw)),
    quoteDate: body.date ? toUtcDate(body.date) : toUtcDate(date),
    source: "exchangerate.host",
  };
}

async function fetchFromProvider(
  base: string,
  quote: string,
  date: Date,
): Promise<ProviderResult | null> {
  const preferred = process.env.FX_PROVIDER === "exchangerate.host" ? "exchangerate.host" : "frankfurter";

  const order =
    preferred === "exchangerate.host"
      ? [fetchExchangerateHost, fetchFrankfurter]
      : [fetchFrankfurter, fetchExchangerateHost];

  for (const fn of order) {
    try {
      const result = await fn(base, quote, date);
      if (result) return result;
    } catch {
      // A provider being down is expected, not exceptional. Try the next one;
      // if all fail the caller falls back to manual entry.
    }
  }
  return null;
}

/**
 * Rate for a pair on a date, from cache when possible.
 *
 * Never throws on a provider failure -- returns null so the caller can ask the
 * user for the rate instead of blocking a payment on a third-party outage.
 */
export async function getRate(
  base: string,
  quote: string,
  date: Date,
): Promise<RateLookup | null> {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();
  const day = toUtcDate(date);

  if (b === q) {
    return { rate: new Decimal(1), date: day, quoteDate: day, source: "cache" };
  }

  // A rate for a future date does not exist. Clamp rather than fetch garbage.
  const today = todayUtc();
  const effective = day.getTime() > today.getTime() ? today : day;

  const cached = await prisma.fxRate.findUnique({
    where: { base_quote_date: { base: b, quote: q, date: effective } },
  });
  if (cached) {
    return {
      rate: toDecimal(cached.rate),
      date: effective,
      quoteDate: cached.quoteDate,
      source: "cache",
    };
  }

  const fetched = await fetchFromProvider(b, q, effective);
  if (!fetched) return null;

  // A fallback to an earlier business day is only final once that date is
  // safely in the past. Asked for *today* before the ECB publishes (~16:00
  // CET), the provider answers with yesterday's rate -- and caching that would
  // pin today to yesterday forever, since rows are never updated. Three days
  // covers any weekend plus a holiday; inside that, the fallback is returned
  // but not stored, and the next lookup asks again.
  const settled =
    fetched.quoteDate.getTime() === effective.getTime() ||
    effective.getTime() < addDays(today, -3).getTime();
  if (!settled) {
    return { rate: fetched.rate, date: effective, quoteDate: fetched.quoteDate, source: fetched.source };
  }

  // Cached under the *requested* date, so a Sunday payment keeps resolving to
  // the same Friday rate forever. `create` rather than `upsert`: a concurrent
  // writer winning the race is fine, and the existing row must not be
  // overwritten.
  try {
    await prisma.fxRate.create({
      data: {
        base: b,
        quote: q,
        date: effective,
        quoteDate: fetched.quoteDate,
        rate: rateToStorage(fetched.rate),
        source: fetched.source,
      },
    });
  } catch {
    // Unique violation: another request cached it first. Same value either way.
  }

  return {
    rate: fetched.rate,
    date: effective,
    quoteDate: fetched.quoteDate,
    source: fetched.source,
  };
}

/** Rate or throw. For paths that genuinely cannot continue without one. */
export async function requireRate(base: string, quote: string, date: Date): Promise<RateLookup> {
  const found = await getRate(base, quote, date);
  if (!found) throw new FxUnavailableError(base, quote, date);
  return found;
}
