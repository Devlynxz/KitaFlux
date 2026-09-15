/**
 * Foreign exchange conversion.
 *
 * Pure math only -- fetching and caching live in `src/server/fx.ts`, so this
 * file is trivially testable and has no network or database in it.
 *
 * The rule that matters, and the one this project exists to get right:
 *
 *   The rate that applies is the rate on the date the money landed.
 *
 * Not today's rate. Not the invoice's issue date. If an invoice was issued in
 * January at 58.20 and paid in March at 56.90, the peso figure that goes on a
 * BIR quarterly return is the March one. Because rates are cached by date and
 * payments store the rate they used, a record computed today still reads the
 * same a year from now -- re-running a report can never retroactively change a
 * number that has already been filed.
 *
 * Fee handling: fees are deducted in the *source* currency before conversion.
 * This matches how Wise, Payoneer and PayPal actually work -- they take their
 * cut off the USD, then convert what remains. Converting first and subtracting
 * a peso fee afterwards produces a different number, and it is the wrong one.
 */
import { Decimal, type MoneyInput, round, toDecimal } from "./money";

export interface ConversionInput {
  /** Gross amount the platform says it sent, in `currency`. */
  amountReceived: MoneyInput;
  /** Platform or bank fee, in `currency`. Zero is fine. */
  feeAmount: MoneyInput;
  /** Currency the payment arrived in, e.g. "USD". */
  currency: string;
  /** Currency the user files taxes in, e.g. "PHP". */
  homeCurrency: string;
  /** Units of `homeCurrency` per one unit of `currency`, on the received date. */
  fxRate: MoneyInput;
}

export interface ConversionResult {
  /** amountReceived, normalised. */
  gross: Decimal;
  /** feeAmount, normalised. */
  fee: Decimal;
  /** gross - fee, in the source currency. What was actually converted. */
  net: Decimal;
  /** round(net x fxRate), in the home currency. What landed in the bank. */
  homeAmount: Decimal;
  /** The rate used, unrounded. */
  rate: Decimal;
}

export class FxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxError";
  }
}

/**
 * The three-number conversion the spec asks for: invoiced (on the invoice),
 * received (gross), and landed (home currency, net of fees).
 */
export function convertPayment(input: ConversionInput): ConversionResult {
  const gross = round(input.amountReceived, input.currency);
  const fee = round(input.feeAmount, input.currency);
  const rate = toDecimal(input.fxRate);

  if (gross.lessThanOrEqualTo(0)) {
    throw new FxError("Amount received must be greater than zero.");
  }
  if (fee.isNegative()) {
    throw new FxError("Fee cannot be negative.");
  }
  if (fee.greaterThan(gross)) {
    throw new FxError("Fee cannot be larger than the amount received.");
  }
  if (rate.lessThanOrEqualTo(0)) {
    throw new FxError("Exchange rate must be greater than zero.");
  }

  const net = gross.minus(fee);

  // Same currency in and out: the rate must be 1 and no conversion happens.
  // Rounding a value by itself would be harmless here, but skipping the
  // multiply keeps a PHP-to-PHP payment exact.
  if (input.currency.toUpperCase() === input.homeCurrency.toUpperCase()) {
    if (!rate.equals(1)) {
      throw new FxError(
        `A ${input.currency} payment recorded in ${input.homeCurrency} must use a rate of 1.`,
      );
    }
    return { gross, fee, net, homeAmount: net, rate };
  }

  const homeAmount = round(net.times(rate), input.homeCurrency);
  return { gross, fee, net, homeAmount, rate };
}

/**
 * Effective rate actually realised, after fees: homeAmount / gross.
 *
 * This is the number a freelancer should look at when comparing Wise against
 * Payoneer, and it is always worse than the headline mid-market rate. Shown on
 * the payment record so the cost of the platform is visible rather than buried.
 */
export function effectiveRate(result: Pick<ConversionResult, "gross" | "homeAmount">): Decimal {
  if (result.gross.isZero()) return new Decimal(0);
  return result.homeAmount.dividedBy(result.gross);
}

/** Fee as a fraction of the gross, for display as a percentage. */
export function feeRatio(result: Pick<ConversionResult, "gross" | "fee">): Decimal {
  if (result.gross.isZero()) return new Decimal(0);
  return result.fee.dividedBy(result.gross);
}

/**
 * Invert a rate. Providers quote some pairs one way round only, so a USD->PHP
 * request may come back as PHP->USD and need flipping before use.
 */
export function invertRate(rate: MoneyInput): Decimal {
  const d = toDecimal(rate);
  if (d.lessThanOrEqualTo(0)) throw new FxError("Cannot invert a non-positive rate.");
  return new Decimal(1).dividedBy(d);
}
