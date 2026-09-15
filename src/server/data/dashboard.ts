import "server-only";

import { Decimal, toDecimal, toStorage } from "@/lib/money";
import { daysBetween, quarterOf, quarterRange, todayUtc } from "@/lib/dates";
import type { Status } from "@/lib/invoice-status";

import { prisma } from "../db";
import { sweepOverdue } from "./invoices";

/**
 * Dashboard aggregates.
 *
 * Outstanding totals are grouped by currency rather than summed into one
 * number. Adding USD to EUR at "today's rate" would produce a figure that
 * changes every time the page is loaded and that matches nothing on any bank
 * statement -- exactly the retroactive drift this project exists to avoid.
 * Money that has actually landed is different: it has a real, recorded rate,
 * so PHP received *is* summable and is the one headline figure.
 */

export interface CurrencyTotal {
  currency: string;
  amount: string;
}

export interface DashboardSummary {
  outstanding: CurrencyTotal[];
  overdue: CurrencyTotal[];
  overdueCount: number;
  draftCount: number;
  /** Home-currency total actually received this quarter. */
  receivedThisQuarter: string;
  receivedLastQuarter: string;
  homeCurrency: string;
  quarterLabel: string;
  upcoming: Array<{
    id: string;
    number: string | null;
    clientName: string;
    currency: string;
    total: string;
    dueDate: Date;
    daysUntilDue: number;
    status: Status;
  }>;
  recentPayments: Array<{
    id: string;
    invoiceId: string;
    invoiceNumber: string | null;
    clientName: string;
    receivedAt: Date;
    currency: string;
    amountReceived: string;
    homeCurrency: string;
    homeAmount: string;
  }>;
  hasAnyInvoice: boolean;
  hasAnyClient: boolean;
}

function groupByCurrency(rows: Array<{ currency: string; amount: Decimal }>): CurrencyTotal[] {
  const map = new Map<string, Decimal>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? new Decimal(0)).plus(r.amount));
  }
  return [...map.entries()]
    .filter(([, amount]) => amount.greaterThan(0))
    .sort((a, b) => b[1].comparedTo(a[1]))
    .map(([currency, amount]) => ({ currency, amount: toStorage(amount, currency) }));
}

export async function getDashboardSummary(
  userId: string,
  homeCurrency: string,
): Promise<DashboardSummary> {
  const today = todayUtc();

  // Reconcile stored statuses before reading them, so the dashboard is never
  // the thing that shows a stale SENT for an invoice that lapsed overnight.
  await sweepOverdue(userId, today);

  const thisQ = quarterOf(today);
  const thisRange = quarterRange(thisQ);
  const lastQ =
    thisQ.quarter === 1
      ? { year: thisQ.year - 1, quarter: 4 as const }
      : { year: thisQ.year, quarter: (thisQ.quarter - 1) as 1 | 2 | 3 };
  const lastRange = quarterRange(lastQ);

  const [open, drafts, quarterPayments, lastQuarterPayments, upcomingRows, recentRows, clientCount] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { userId, status: { in: ["SENT", "OVERDUE"] } },
        select: {
          currency: true,
          total: true,
          status: true,
          payments: { select: { amountReceived: true } },
        },
      }),
      prisma.invoice.count({ where: { userId, status: "DRAFT" } }),
      prisma.payment.findMany({
        where: { userId, receivedAt: { gte: thisRange.start, lt: thisRange.end } },
        select: { homeAmount: true },
      }),
      prisma.payment.findMany({
        where: { userId, receivedAt: { gte: lastRange.start, lt: lastRange.end } },
        select: { homeAmount: true },
      }),
      prisma.invoice.findMany({
        where: { userId, status: { in: ["SENT", "OVERDUE"] } },
        orderBy: { dueDate: "asc" },
        take: 6,
        select: {
          id: true,
          number: true,
          currency: true,
          total: true,
          dueDate: true,
          status: true,
          client: { select: { name: true } },
        },
      }),
      prisma.payment.findMany({
        where: { userId },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          invoiceId: true,
          receivedAt: true,
          currency: true,
          amountReceived: true,
          homeCurrency: true,
          homeAmount: true,
          invoice: { select: { number: true, client: { select: { name: true } } } },
        },
      }),
      prisma.client.count({ where: { userId, archivedAt: null } }),
    ]);

  // Outstanding is what is still owed: total minus anything already received.
  const balances = open.map((inv) => {
    const paid = inv.payments.reduce(
      (acc, p) => acc.plus(toDecimal(p.amountReceived)),
      new Decimal(0),
    );
    return {
      currency: inv.currency,
      status: inv.status,
      amount: toDecimal(inv.total).minus(paid),
    };
  });

  const totalInvoices = open.length + drafts;

  return {
    outstanding: groupByCurrency(balances),
    overdue: groupByCurrency(balances.filter((b) => b.status === "OVERDUE")),
    overdueCount: balances.filter((b) => b.status === "OVERDUE").length,
    draftCount: drafts,
    receivedThisQuarter: toStorage(
      quarterPayments.reduce((a, p) => a.plus(toDecimal(p.homeAmount)), new Decimal(0)),
      homeCurrency,
    ),
    receivedLastQuarter: toStorage(
      lastQuarterPayments.reduce((a, p) => a.plus(toDecimal(p.homeAmount)), new Decimal(0)),
      homeCurrency,
    ),
    homeCurrency,
    quarterLabel: `Q${thisQ.quarter} ${thisQ.year}`,
    upcoming: upcomingRows.map((r) => ({
      id: r.id,
      number: r.number,
      clientName: r.client.name,
      currency: r.currency,
      total: toStorage(r.total, r.currency),
      dueDate: r.dueDate,
      daysUntilDue: daysBetween(today, r.dueDate),
      status: r.status,
    })),
    recentPayments: recentRows.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.number,
      clientName: p.invoice.client.name,
      receivedAt: p.receivedAt,
      currency: p.currency,
      amountReceived: toStorage(p.amountReceived, p.currency),
      homeCurrency: p.homeCurrency,
      homeAmount: toStorage(p.homeAmount, p.homeCurrency),
    })),
    hasAnyInvoice: totalInvoices > 0 || recentRows.length > 0,
    hasAnyClient: clientCount > 0,
  };
}
