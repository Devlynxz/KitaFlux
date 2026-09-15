import "server-only";

import { Decimal, toDecimal, toStorage } from "@/lib/money";
import { csvCell, textCell } from "@/lib/csv";
import { formatQuarter, quarterRange, type Quarter } from "@/lib/dates";

import { prisma } from "../db";

/**
 * Quarterly summary.
 *
 * What a Filipino freelancer needs in front of them when filling in a BIR
 * 1701Q: gross receipts in pesos for the quarter, broken down by client, using
 * the rate on the date each payment landed.
 *
 * The figures come entirely from stored `homeAmount` values on payments -- no
 * rate is looked up at report time. That is the whole point: a report re-run in
 * December returns exactly what it returned in March.
 *
 * This app does not compute tax owed, apply the 8% option, or advise on
 * deductions. That is out of scope by design, and the UI says so.
 */

export interface ClientBreakdownRow {
  clientId: string;
  clientName: string;
  country: string;
  paymentCount: number;
  /** Gross received per source currency, for reference. */
  grossByCurrency: Array<{ currency: string; amount: string }>;
  feesHome: string;
  grossHome: string;
}

export interface QuarterlyReport {
  quarter: Quarter;
  label: string;
  homeCurrency: string;
  start: Date;
  end: Date;
  paymentCount: number;
  /** Sum of homeAmount: what actually landed, net of platform fees. */
  netHome: string;
  /** Fees converted at each payment's own rate. */
  feesHome: string;
  /** netHome + feesHome: gross receipts before platform fees. */
  grossHome: string;
  byClient: ClientBreakdownRow[];
  byCurrency: Array<{ currency: string; gross: string; fees: string; net: string; homeNet: string }>;
}

export async function getQuarterlyReport(
  userId: string,
  quarter: Quarter,
  homeCurrency: string,
): Promise<QuarterlyReport> {
  const { start, end } = quarterRange(quarter);

  const payments = await prisma.payment.findMany({
    where: { userId, receivedAt: { gte: start, lt: end } },
    orderBy: { receivedAt: "asc" },
    include: {
      invoice: {
        select: { client: { select: { id: true, name: true, country: true } } },
      },
    },
  });

  const zero = new Decimal(0);
  let netHome = zero;
  let feesHome = zero;

  const clients = new Map<
    string,
    {
      name: string;
      country: string;
      count: number;
      gross: Map<string, Decimal>;
      feesHome: Decimal;
      grossHome: Decimal;
    }
  >();

  const currencies = new Map<
    string,
    { gross: Decimal; fees: Decimal; net: Decimal; homeNet: Decimal }
  >();

  for (const p of payments) {
    const rate = toDecimal(p.fxRate);
    const home = toDecimal(p.homeAmount);
    const gross = toDecimal(p.amountReceived);
    const fee = toDecimal(p.feeAmount);

    // The fee is converted at the same rate the payment used, not at any later
    // rate -- so grossHome and netHome stay internally consistent.
    const feeHome = fee.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    netHome = netHome.plus(home);
    feesHome = feesHome.plus(feeHome);

    const c = p.invoice.client;
    const entry =
      clients.get(c.id) ??
      {
        name: c.name,
        country: c.country,
        count: 0,
        gross: new Map<string, Decimal>(),
        feesHome: zero,
        grossHome: zero,
      };
    entry.count += 1;
    entry.gross.set(p.currency, (entry.gross.get(p.currency) ?? zero).plus(gross));
    entry.feesHome = entry.feesHome.plus(feeHome);
    entry.grossHome = entry.grossHome.plus(home).plus(feeHome);
    clients.set(c.id, entry);

    const cur = currencies.get(p.currency) ?? { gross: zero, fees: zero, net: zero, homeNet: zero };
    currencies.set(p.currency, {
      gross: cur.gross.plus(gross),
      fees: cur.fees.plus(fee),
      net: cur.net.plus(toDecimal(p.netAmount)),
      homeNet: cur.homeNet.plus(home),
    });
  }

  return {
    quarter,
    label: formatQuarter(quarter),
    homeCurrency,
    start,
    end,
    paymentCount: payments.length,
    netHome: toStorage(netHome, homeCurrency),
    feesHome: toStorage(feesHome, homeCurrency),
    grossHome: toStorage(netHome.plus(feesHome), homeCurrency),
    byClient: [...clients.entries()]
      .map(([clientId, e]) => ({
        clientId,
        clientName: e.name,
        country: e.country,
        paymentCount: e.count,
        grossByCurrency: [...e.gross.entries()].map(([currency, amount]) => ({
          currency,
          amount: toStorage(amount, currency),
        })),
        feesHome: toStorage(e.feesHome, homeCurrency),
        grossHome: toStorage(e.grossHome, homeCurrency),
      }))
      .sort((a, b) => toDecimal(b.grossHome).comparedTo(toDecimal(a.grossHome))),
    byCurrency: [...currencies.entries()]
      .map(([currency, v]) => ({
        currency,
        gross: toStorage(v.gross, currency),
        fees: toStorage(v.fees, currency),
        net: toStorage(v.net, currency),
        homeNet: toStorage(v.homeNet, homeCurrency),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

/**
 * Per-payment CSV, not a summary.
 *
 * A summary row cannot be checked against anything. A line per payment can be
 * reconciled against a bank statement, which is what a freelancer (or their
 * accountant) actually does with this file.
 */
export async function getQuarterlyCsv(
  userId: string,
  quarter: Quarter,
  homeCurrency: string,
): Promise<string> {
  const { start, end } = quarterRange(quarter);

  const payments = await prisma.payment.findMany({
    where: { userId, receivedAt: { gte: start, lt: end } },
    orderBy: { receivedAt: "asc" },
    include: {
      invoice: {
        select: { number: true, issueDate: true, client: { select: { name: true, country: true } } },
      },
    },
  });

  const header = [
    "date_received",
    "invoice_number",
    "invoice_date",
    "client",
    "client_country",
    "currency",
    "amount_received",
    "platform_fee",
    "net_received",
    "fx_rate",
    "fx_rate_source",
    `net_${homeCurrency.toLowerCase()}`,
    "reference",
  ];

  const lines = [header.join(",")];

  for (const p of payments) {
    lines.push(
      [
        csvCell(p.receivedAt.toISOString().slice(0, 10)),
        textCell(p.invoice.number ?? ""),
        csvCell(p.invoice.issueDate.toISOString().slice(0, 10)),
        textCell(p.invoice.client.name),
        textCell(p.invoice.client.country),
        csvCell(p.currency),
        csvCell(toStorage(p.amountReceived, p.currency)),
        csvCell(toStorage(p.feeAmount, p.currency)),
        csvCell(toStorage(p.netAmount, p.currency)),
        csvCell(toDecimal(p.fxRate).toFixed(6)),
        textCell(p.fxRateSource),
        csvCell(toStorage(p.homeAmount, p.homeCurrency)),
        textCell(p.reference ?? ""),
      ].join(","),
    );
  }

  return lines.join("\r\n");
}
