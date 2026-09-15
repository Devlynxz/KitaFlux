import "server-only";

import { Decimal, toDecimal, toStorage } from "@/lib/money";
import { convertPayment } from "@/lib/fx";
import { rateToStorage } from "@/lib/money";
import { addDays, toUtcDate, todayUtc } from "@/lib/dates";
import { PAGE_SIZE, pageBounds, type Page } from "@/lib/pagination";

import { prisma } from "../db";
import { lockInvoice, refreshInvoiceStatus } from "./invoices";

/**
 * Payment data access.
 *
 * A payment is the only place in the app where money crosses currencies, so it
 * is the only place `convertPayment` is called. The invoice's status is
 * recomputed in the same breath -- there is no path that records money without
 * re-running the state machine.
 */

export interface PaymentInput {
  invoiceId: string;
  receivedAt: Date;
  amountReceived: string;
  feeAmount: string;
  /** Currency the money arrived in. Defaults to the invoice currency. */
  currency: string;
  homeCurrency: string;
  fxRate: string;
  fxRateSource: string;
  reference?: string | null;
  note?: string | null;
}

export class PaymentTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentTargetError";
  }
}

export async function recordPayment(userId: string, input: PaymentInput) {
  // One day of slack past today in UTC: Manila is UTC+8, so for the first eight
  // hours of a local day "today" there is still "tomorrow" in UTC.
  if (toUtcDate(input.receivedAt).getTime() > addDays(todayUtc(), 1).getTime()) {
    throw new PaymentTargetError("The date received cannot be in the future.");
  }

  // Throws on a negative fee, a fee larger than the amount, or a rate of zero.
  const conversion = convertPayment({
    amountReceived: input.amountReceived,
    feeAmount: input.feeAmount,
    currency: input.currency,
    homeCurrency: input.homeCurrency,
    fxRate: input.fxRate,
  });

  return prisma.$transaction(async (tx) => {
    // Locked so the status check, the insert, and the status recompute see one
    // consistent invoice: a concurrent void cannot slip in between them.
    const invoice = await lockInvoice(tx, userId, input.invoiceId);
    if (!invoice) throw new PaymentTargetError("That invoice does not exist.");

    if (invoice.status === "DRAFT") {
      throw new PaymentTargetError("Send the invoice before recording a payment against it.");
    }
    if (invoice.status === "VOID") {
      throw new PaymentTargetError("This invoice has been voided.");
    }

    // "Paid" is decided by summing amountReceived against the invoice total,
    // which is only meaningful in one currency. A EUR 1,800 payment against a
    // USD 3,000 invoice would otherwise count as USD 1,800 and could mark the
    // invoice paid.
    if (input.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
      throw new PaymentTargetError(
        `This invoice is in ${invoice.currency}. Record the amount the client paid in ${invoice.currency}.`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        userId,
        invoiceId: input.invoiceId,
        receivedAt: toUtcDate(input.receivedAt),
        currency: input.currency,
        amountReceived: toStorage(conversion.gross, input.currency),
        feeAmount: toStorage(conversion.fee, input.currency),
        netAmount: toStorage(conversion.net, input.currency),
        homeCurrency: input.homeCurrency,
        fxRate: rateToStorage(conversion.rate),
        homeAmount: toStorage(conversion.homeAmount, input.homeCurrency),
        fxRateSource: input.fxRateSource,
        reference: input.reference ?? null,
        note: input.note ?? null,
      },
    });

    await refreshInvoiceStatus(userId, input.invoiceId, todayUtc(), tx);
    return payment;
  });
}

export async function deletePayment(userId: string, paymentId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    select: { id: true, invoiceId: true },
  });
  if (!payment) return false;

  return prisma.$transaction(async (tx) => {
    await lockInvoice(tx, userId, payment.invoiceId);
    const deleted = await tx.payment.deleteMany({ where: { id: paymentId, userId } });
    if (deleted.count === 0) return false;
    // Removing money can move a PAID invoice back to SENT or OVERDUE.
    await refreshInvoiceStatus(userId, payment.invoiceId, todayUtc(), tx);
    return true;
  });
}

export interface PaymentListItem {
  id: string;
  receivedAt: Date;
  currency: string;
  amountReceived: string;
  feeAmount: string;
  netAmount: string;
  homeCurrency: string;
  homeAmount: string;
  fxRate: string;
  fxRateSource: string;
  reference: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string;
}

export async function listPayments(
  userId: string,
  opts: { from?: Date; to?: Date; clientId?: string; page?: number; pageSize?: number } = {},
): Promise<Page<PaymentListItem>> {
  const where = {
    userId,
    ...(opts.from || opts.to
      ? {
          receivedAt: {
            ...(opts.from ? { gte: toUtcDate(opts.from) } : {}),
            // Ranges are half-open: `lt`, not `lte`.
            ...(opts.to ? { lt: toUtcDate(opts.to) } : {}),
          },
        }
      : {}),
    ...(opts.clientId ? { invoice: { clientId: opts.clientId } } : {}),
  };

  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const total = await prisma.payment.count({ where });
  const { page, pageCount, skip, take } = pageBounds(total, opts.page ?? 1, pageSize);

  const rows = await prisma.payment.findMany({
    where,
    // id last: several payments can land on the same day.
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    include: {
      invoice: { select: { id: true, number: true, client: { select: { name: true } } } },
    },
  });

  const items = rows.map((p) => ({
    id: p.id,
    receivedAt: p.receivedAt,
    currency: p.currency,
    amountReceived: toStorage(p.amountReceived, p.currency),
    feeAmount: toStorage(p.feeAmount, p.currency),
    netAmount: toStorage(p.netAmount, p.currency),
    homeCurrency: p.homeCurrency,
    homeAmount: toStorage(p.homeAmount, p.homeCurrency),
    fxRate: toDecimal(p.fxRate).toFixed(6),
    fxRateSource: p.fxRateSource,
    reference: p.reference,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoice.number,
    clientName: p.invoice.client.name,
  }));

  return { items, total, page, pageSize, pageCount };
}

/**
 * Totals across *every* payment, for the summary above a paginated list.
 *
 * Summed in Postgres rather than from the page in hand, which would quietly
 * report only the rows on screen. The fee is converted at each payment's own
 * rate and rounded per row, exactly as the quarterly report does, so the two
 * pages can never disagree by a centavo.
 */
export async function summarizePayments(
  userId: string,
): Promise<{ count: number; homeTotal: Decimal; feesHome: Decimal }> {
  const rows = await prisma.$queryRaw<
    Array<{ count: bigint; home_total: unknown; fees_home: unknown }>
  >`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM("homeAmount"), 0) AS home_total,
      COALESCE(SUM(ROUND("feeAmount" * "fxRate", 2)), 0) AS fees_home
    FROM "payment"
    WHERE "userId" = ${userId}
  `;
  const row = rows[0];
  return {
    count: Number(row?.count ?? 0),
    homeTotal: toDecimal(String(row?.home_total ?? "0")),
    feesHome: toDecimal(String(row?.fees_home ?? "0")),
  };
}

export async function getPayment(userId: string, paymentId: string) {
  return prisma.payment.findFirst({
    where: { id: paymentId, userId },
    include: { invoice: { select: { id: true, number: true, currency: true } } },
  });
}

/** Total landed in the home currency across a date range. */
export async function sumHomeAmount(
  userId: string,
  range: { from: Date; to: Date },
): Promise<Decimal> {
  const rows = await prisma.payment.findMany({
    where: {
      userId,
      receivedAt: { gte: toUtcDate(range.from), lt: toUtcDate(range.to) },
    },
    select: { homeAmount: true },
  });
  return rows.reduce((acc, r) => acc.plus(toDecimal(r.homeAmount)), new Decimal(0));
}
