import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { toDateInputValue } from "@/lib/dates";

/**
 * End-to-end invoice lifecycle, against a real database.
 *
 * Walks the path a user actually takes -- create a client, draft an invoice,
 * send it, take a partial payment, then the rest -- and asserts the things that
 * are easy to get wrong: that a draft has no number, that sending mints one,
 * that a partial payment does not mark the invoice paid, that a covering
 * payment does, and that removing a payment reopens it.
 *
 * Also renders the real PDF, because a document generator that throws on a
 * particular shape of invoice is not something a unit test would catch.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("invoice lifecycle", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL! }),
  });

  const tag = randomUUID().slice(0, 8);
  const userId = randomUUID();
  let clientId: string;
  let invoiceId: string;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email: `life-${tag}@test.invalid`,
        name: "Lifecycle User",
        businessName: "Lifecycle Studio",
        tin: "123-456-789-000",
        invoicePrefix: "LIF",
        homeCurrency: "PHP",
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates a client", async () => {
    const { createClient } = await import("../data/clients");
    const client = await createClient(userId, {
      name: "Jordan Reyes",
      email: "jordan@acme.test",
      company: "Acme Inc.",
      country: "US",
      currency: "USD",
    });
    clientId = client.id;
    expect(client.currency).toBe("USD");
  });

  it("creates a draft with computed totals and no number", async () => {
    const { createInvoice, getInvoice } = await import("../data/invoices");

    const created = await createInvoice(userId, {
      clientId,
      issueDate: new Date("2026-03-01T00:00:00Z"),
      dueDate: new Date("2026-03-15T00:00:00Z"),
      currency: "USD",
      taxRate: "0",
      notes: "March work.",
      lineItems: [
        { description: "Design retainer", quantity: "1", unitPrice: "1000.00" },
        // 7.25 * 27.59 = 200.0275 -> 200.03
        { description: "Extra hours", quantity: "7.25", unitPrice: "27.59" },
      ],
    });
    invoiceId = created.id;

    const invoice = await getInvoice(userId, invoiceId);
    expect(invoice!.status).toBe("DRAFT");
    // A draft must not consume a number.
    expect(invoice!.number).toBeNull();
    expect(invoice!.seq).toBeNull();
    expect(invoice!.subtotal.toString()).toBe("1200.03");
    expect(invoice!.total.toString()).toBe("1200.03");
    expect(invoice!.lineItems[1].amount.toString()).toBe("200.03");
  });

  it("refuses a payment against a draft", async () => {
    const { recordPayment } = await import("../data/payments");
    await expect(
      recordPayment(userId, {
        invoiceId,
        receivedAt: new Date("2026-03-05T00:00:00Z"),
        amountReceived: "100",
        feeAmount: "0",
        currency: "USD",
        homeCurrency: "PHP",
        fxRate: "57.85",
        fxRateSource: "manual",
      }),
    ).rejects.toThrow(/send the invoice/i);
  });

  it("mints a number on send and locks the invoice", async () => {
    const { getInvoice, markInvoiceSent } = await import("../data/invoices");

    const { number } = await markInvoiceSent(userId, invoiceId);
    expect(number).toBe("LIF-0001");

    const invoice = await getInvoice(userId, invoiceId);
    expect(invoice!.status).toBe("SENT");
    expect(invoice!.seq).toBe(1);
    expect(invoice!.sentAt).not.toBeNull();

    // Editing a sent invoice is refused.
    const { updateInvoice } = await import("../data/invoices");
    await expect(
      updateInvoice(userId, invoiceId, {
        clientId,
        issueDate: new Date("2026-03-01T00:00:00Z"),
        dueDate: new Date("2026-03-15T00:00:00Z"),
        currency: "USD",
        taxRate: "0",
        lineItems: [{ description: "Sneaky change", quantity: "1", unitPrice: "1" }],
      }),
    ).rejects.toThrow(/no longer be edited/i);
  });

  it("is idempotent on a re-send", async () => {
    const { markInvoiceSent } = await import("../data/invoices");
    const again = await markInvoiceSent(userId, invoiceId);
    // Same number, not LIF-0002.
    expect(again.number).toBe("LIF-0001");
  });

  it("refuses a payment in a currency other than the invoice's", async () => {
    const { recordPayment } = await import("../data/payments");
    const { getInvoice } = await import("../data/invoices");

    // EUR 1,200.03 would otherwise be summed as USD 1,200.03 and mark this
    // USD invoice paid.
    await expect(
      recordPayment(userId, {
        invoiceId,
        receivedAt: new Date("2026-03-05T00:00:00Z"),
        amountReceived: "1200.03",
        feeAmount: "0",
        currency: "EUR",
        homeCurrency: "PHP",
        fxRate: "63.10",
        fxRateSource: "manual",
      }),
    ).rejects.toThrow(/invoice is in USD/i);

    const invoice = await getInvoice(userId, invoiceId);
    expect(invoice!.status).toBe("SENT");
    expect(invoice!.payments).toHaveLength(0);
  });

  it("refuses a payment dated in the future", async () => {
    const { recordPayment } = await import("../data/payments");
    const { addDays, todayUtc } = await import("@/lib/dates");

    await expect(
      recordPayment(userId, {
        invoiceId,
        receivedAt: addDays(todayUtc(), 3),
        amountReceived: "100",
        feeAmount: "0",
        currency: "USD",
        homeCurrency: "PHP",
        fxRate: "57.85",
        fxRateSource: "manual",
      }),
    ).rejects.toThrow(/future/i);
  });

  it("keeps a partly-paid invoice open", async () => {
    const { recordPayment } = await import("../data/payments");
    const { getInvoice } = await import("../data/invoices");

    await recordPayment(userId, {
      invoiceId,
      receivedAt: new Date("2026-03-05T00:00:00Z"),
      amountReceived: "600.00",
      feeAmount: "7.20",
      currency: "USD",
      homeCurrency: "PHP",
      fxRate: "57.85",
      fxRateSource: "manual",
    });

    const invoice = await getInvoice(userId, invoiceId);
    // 600 of 1200.03 does not settle the invoice, so it stays open. Its due
    // date (15 Mar 2026) is in the past, so "open" means OVERDUE rather than
    // SENT -- a partial payment must not reset the overdue clock.
    expect(invoice!.status).toBe("OVERDUE");
    expect(invoice!.paidAt).toBeNull();

    const payment = invoice!.payments[0];
    expect(payment.netAmount.toString()).toBe("592.8");
    // 592.80 * 57.85 = 34,293.48
    expect(payment.homeAmount.toString()).toBe("34293.48");
  });

  it("marks it paid once payments cover the total", async () => {
    const { recordPayment } = await import("../data/payments");
    const { getInvoice } = await import("../data/invoices");

    await recordPayment(userId, {
      invoiceId,
      receivedAt: new Date("2026-03-20T00:00:00Z"),
      amountReceived: "600.03",
      feeAmount: "7.20",
      currency: "USD",
      homeCurrency: "PHP",
      // A different rate on a different day -- the whole point of the app.
      fxRate: "58.4012",
      fxRateSource: "manual",
    });

    const invoice = await getInvoice(userId, invoiceId);
    expect(invoice!.status).toBe("PAID");
    expect(invoice!.paidAt).not.toBeNull();
  });

  it("reopens the invoice when a payment is removed", async () => {
    const { getInvoice } = await import("../data/invoices");
    const { deletePayment } = await import("../data/payments");

    const before = await getInvoice(userId, invoiceId);
    const latest = before!.payments[0];

    expect(await deletePayment(userId, latest.id)).toBe(true);

    const after = await getInvoice(userId, invoiceId);
    // Due 15 Mar 2026 is in the past, so it lands on OVERDUE, not SENT.
    expect(after!.status).toBe("OVERDUE");
    expect(after!.paidAt).toBeNull();
  });

  it("renders a real PDF", async () => {
    const { getInvoice } = await import("../data/invoices");
    const { renderInvoicePdf, invoiceFilename } = await import("../pdf/render");

    const invoice = await getInvoice(userId, invoiceId);
    const pdf = await renderInvoicePdf(invoice!);

    expect(pdf.byteLength).toBeGreaterThan(1000);
    // A real PDF starts with %PDF-.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(invoiceFilename(invoice!)).toBe("LIF-0001.pdf");
  });

  it("reports the quarter from stored rates, not today's rate", async () => {
    const { getQuarterlyReport, getQuarterlyCsv } = await import("../data/reports");

    const report = await getQuarterlyReport(userId, { year: 2026, quarter: 1 }, "PHP");
    expect(report.paymentCount).toBe(1);
    expect(report.netHome).toBe("34293.48");
    // Fee converted at the payment's own rate: 7.20 * 57.85 = 416.52
    expect(report.feesHome).toBe("416.52");
    expect(report.grossHome).toBe("34710.00");
    expect(report.byClient[0].clientName).toBe("Jordan Reyes");

    const csv = await getQuarterlyCsv(userId, { year: 2026, quarter: 1 }, "PHP");
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("net_php");
    expect(rows[1]).toContain("LIF-0001");
    expect(rows[1]).toContain("34293.48");
  });

  it("voids an unpaid invoice but keeps its number in the series", async () => {
    const { getInvoice, voidInvoice } = await import("../data/invoices");

    await voidInvoice(userId, invoiceId);
    const invoice = await getInvoice(userId, invoiceId);

    expect(invoice!.status).toBe("VOID");
    // The number stays: a missing number would read as a deleted invoice.
    expect(invoice!.number).toBe("LIF-0001");
    expect(invoice!.voidedAt).not.toBeNull();
  });

  it("gives the next invoice the following number", async () => {
    const { createInvoice, markInvoiceSent } = await import("../data/invoices");

    const next = await createInvoice(userId, {
      clientId,
      issueDate: new Date("2026-04-01T00:00:00Z"),
      dueDate: new Date("2026-04-15T00:00:00Z"),
      currency: "USD",
      taxRate: "0.12",
      lineItems: [{ description: "April work", quantity: "1", unitPrice: "500.00" }],
    });

    const { number } = await markInvoiceSent(userId, next.id);
    expect(number).toBe("LIF-0002");

    const { getInvoice } = await import("../data/invoices");
    const invoice = await getInvoice(userId, next.id);
    expect(invoice!.taxAmount.toString()).toBe("60");
    expect(invoice!.total.toString()).toBe("560");
  });

  it("shows the right dashboard totals", async () => {
    const { getDashboardSummary } = await import("../data/dashboard");
    const s = await getDashboardSummary(userId, "PHP");

    // LIF-0001 is void; LIF-0002 is open for 560 USD.
    expect(s.outstanding).toEqual([{ currency: "USD", amount: "560.00" }]);
    expect(s.receivedThisQuarter).toBe("0.00");
    expect(s.hasAnyClient).toBe(true);
  });

  it("keeps date-only fields on the right calendar day", async () => {
    const { getInvoice } = await import("../data/invoices");
    const invoice = await getInvoice(userId, invoiceId);
    // Stored as a date column; must read back as the day it was written.
    expect(toDateInputValue(invoice!.issueDate)).toBe("2026-03-01");
    expect(toDateInputValue(invoice!.dueDate)).toBe("2026-03-15");
  });
});
