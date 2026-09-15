import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Data isolation.
 *
 * The spec calls this out: "Every query must be scoped by userId. One missed
 * scope is a data leak. Write a test for this."
 *
 * This is that test. It builds two real users with real rows and then asks, for
 * every read and write path in the data layer, whether user B can reach user
 * A's data. Every answer must be no.
 *
 * It talks to a real Postgres because the thing under test is the SQL where
 * clause. A mocked Prisma would happily "pass" while the real query leaked.
 *
 * Requires DATABASE_URL. Skips itself when there is no database, so `npm test`
 * still works on a machine without one -- but CI must set DATABASE_URL, because
 * a silently skipped isolation test is worse than no test.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("data isolation", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL! }),
  });

  // Unique per run so concurrent runs cannot collide.
  const tag = randomUUID().slice(0, 8);
  const alice = { id: randomUUID(), email: `alice-${tag}@isolation.test` };
  const mallory = { id: randomUUID(), email: `mallory-${tag}@isolation.test` };

  let aliceClientId: string;
  let aliceInvoiceId: string;
  let alicePaymentId: string;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: alice.id, email: alice.email, name: "Alice", invoicePrefix: "ALI" },
        { id: mallory.id, email: mallory.email, name: "Mallory", invoicePrefix: "MAL" },
      ],
    });

    const client = await prisma.client.create({
      data: {
        userId: alice.id,
        name: "Alice Secret Client",
        email: "secret@alice.test",
        country: "US",
        currency: "USD",
      },
    });
    aliceClientId = client.id;

    const invoice = await prisma.invoice.create({
      data: {
        userId: alice.id,
        clientId: client.id,
        number: "ALI-0001",
        seq: 1,
        status: "SENT",
        issueDate: new Date("2026-01-01T00:00:00Z"),
        dueDate: new Date("2026-01-15T00:00:00Z"),
        currency: "USD",
        subtotal: "1000.00",
        taxAmount: "0.00",
        total: "1000.00",
        lineItems: {
          create: [
            {
              position: 0,
              description: "Confidential work",
              quantity: "1",
              unitPrice: "1000.00",
              amount: "1000.00",
            },
          ],
        },
      },
    });
    aliceInvoiceId = invoice.id;

    const payment = await prisma.payment.create({
      data: {
        userId: alice.id,
        invoiceId: invoice.id,
        receivedAt: new Date("2026-01-10T00:00:00Z"),
        currency: "USD",
        amountReceived: "1000.00",
        feeAmount: "10.00",
        netAmount: "990.00",
        homeCurrency: "PHP",
        fxRate: "58.0000000000",
        homeAmount: "57420.00",
        fxRateSource: "manual",
      },
    });
    alicePaymentId = payment.id;
  });

  afterAll(async () => {
    // Cascades clean up clients, invoices, line items and payments.
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, mallory.id] } } });
    await prisma.$disconnect();
  });

  describe("clients", () => {
    it("does not list another user's clients", async () => {
      const { listClients } = await import("../data/clients");
      const rows = (await listClients(mallory.id)).items;
      expect(rows).toHaveLength(0);
    });

    it("does not return another user's client by id", async () => {
      const { getClient } = await import("../data/clients");
      expect(await getClient(mallory.id, aliceClientId)).toBeNull();
      // Sanity: the row genuinely exists for its owner.
      expect(await getClient(alice.id, aliceClientId)).not.toBeNull();
    });

    it("refuses to update another user's client", async () => {
      const { getClient, updateClient } = await import("../data/clients");
      const updated = await updateClient(mallory.id, aliceClientId, {
        name: "Pwned",
        email: "attacker@evil.test",
        country: "US",
        currency: "USD",
      });
      expect(updated).toBe(false);

      const untouched = await getClient(alice.id, aliceClientId);
      expect(untouched?.name).toBe("Alice Secret Client");
    });

    it("refuses to archive another user's client", async () => {
      const { getClient, setClientArchived } = await import("../data/clients");
      expect(await setClientArchived(mallory.id, aliceClientId, true)).toBe(false);
      expect((await getClient(alice.id, aliceClientId))?.archivedAt).toBeNull();
    });

    it("refuses to delete another user's client", async () => {
      const { deleteClient, getClient } = await import("../data/clients");
      const result = await deleteClient(mallory.id, aliceClientId);
      expect(result.ok).toBe(false);
      expect(await getClient(alice.id, aliceClientId)).not.toBeNull();
    });
  });

  describe("invoices", () => {
    it("does not list another user's invoices", async () => {
      const { listInvoices } = await import("../data/invoices");
      expect((await listInvoices(mallory.id)).items).toHaveLength(0);
    });

    it("does not leak another user's invoices via a clientId filter", async () => {
      const { listInvoices } = await import("../data/invoices");
      // Passing Alice's real clientId must not widen Mallory's scope.
      expect((await listInvoices(mallory.id, { clientId: aliceClientId })).items).toHaveLength(0);
    });

    it("does not return another user's invoice by id", async () => {
      const { getInvoice } = await import("../data/invoices");
      expect(await getInvoice(mallory.id, aliceInvoiceId)).toBeNull();
      expect(await getInvoice(alice.id, aliceInvoiceId)).not.toBeNull();
    });

    it("refuses to void another user's invoice", async () => {
      const { getInvoice, voidInvoice } = await import("../data/invoices");
      await expect(voidInvoice(mallory.id, aliceInvoiceId)).rejects.toThrow();
      expect((await getInvoice(alice.id, aliceInvoiceId))?.status).toBe("SENT");
    });

    it("refuses to send another user's invoice", async () => {
      const { markInvoiceSent } = await import("../data/invoices");
      await expect(markInvoiceSent(mallory.id, aliceInvoiceId)).rejects.toThrow();
    });

    it("refuses to delete another user's invoice", async () => {
      const { deleteInvoice, getInvoice } = await import("../data/invoices");
      expect(await deleteInvoice(mallory.id, aliceInvoiceId)).toBe(false);
      expect(await getInvoice(alice.id, aliceInvoiceId)).not.toBeNull();
    });

    it("refuses to attach another user's client to an invoice", async () => {
      const { createInvoice } = await import("../data/invoices");
      // The classic confused-deputy: Mallory is authenticated as herself but
      // posts Alice's clientId.
      await expect(
        createInvoice(mallory.id, {
          clientId: aliceClientId,
          issueDate: new Date("2026-02-01T00:00:00Z"),
          dueDate: new Date("2026-02-15T00:00:00Z"),
          currency: "USD",
          taxRate: "0",
          lineItems: [{ description: "x", quantity: "1", unitPrice: "1" }],
        }),
      ).rejects.toThrow(/client does not exist/i);
    });

    it("does not sweep another user's invoices", async () => {
      const { sweepOverdue } = await import("../data/invoices");
      // Alice's invoice is long past due, but this is Mallory's sweep.
      expect(await sweepOverdue(mallory.id, new Date("2026-06-01T00:00:00Z"))).toBe(0);
    });

    it("does not refresh another user's invoice status", async () => {
      const { refreshInvoiceStatus } = await import("../data/invoices");
      expect(await refreshInvoiceStatus(mallory.id, aliceInvoiceId)).toBeNull();
    });
  });

  describe("payments", () => {
    it("does not list another user's payments", async () => {
      const { listPayments } = await import("../data/payments");
      expect((await listPayments(mallory.id)).items).toHaveLength(0);
    });

    it("does not return another user's payment by id", async () => {
      const { getPayment } = await import("../data/payments");
      expect(await getPayment(mallory.id, alicePaymentId)).toBeNull();
    });

    it("refuses to delete another user's payment", async () => {
      const { deletePayment, getPayment } = await import("../data/payments");
      expect(await deletePayment(mallory.id, alicePaymentId)).toBe(false);
      expect(await getPayment(alice.id, alicePaymentId)).not.toBeNull();
    });

    it("refuses to record a payment against another user's invoice", async () => {
      const { recordPayment } = await import("../data/payments");
      await expect(
        recordPayment(mallory.id, {
          invoiceId: aliceInvoiceId,
          receivedAt: new Date("2026-02-01T00:00:00Z"),
          amountReceived: "100",
          feeAmount: "0",
          currency: "USD",
          homeCurrency: "PHP",
          fxRate: "58",
          fxRateSource: "manual",
        }),
      ).rejects.toThrow(/invoice does not exist/i);
    });

    it("sums only the caller's own payments", async () => {
      const { sumHomeAmount } = await import("../data/payments");
      const range = {
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2027-01-01T00:00:00Z"),
      };
      expect((await sumHomeAmount(mallory.id, range)).toString()).toBe("0");
      expect((await sumHomeAmount(alice.id, range)).toString()).toBe("57420");
    });
  });

  describe("aggregates", () => {
    it("shows another user nothing on the dashboard", async () => {
      const { getDashboardSummary } = await import("../data/dashboard");
      const s = await getDashboardSummary(mallory.id, "PHP");
      expect(s.outstanding).toHaveLength(0);
      expect(s.overdueCount).toBe(0);
      expect(s.recentPayments).toHaveLength(0);
      expect(s.upcoming).toHaveLength(0);
      expect(s.receivedThisQuarter).toBe("0.00");
    });

    it("excludes another user from the quarterly report", async () => {
      const { getQuarterlyReport } = await import("../data/reports");
      const report = await getQuarterlyReport(mallory.id, { year: 2026, quarter: 1 }, "PHP");
      expect(report.paymentCount).toBe(0);
      expect(report.netHome).toBe("0.00");
      expect(report.byClient).toHaveLength(0);
    });

    it("includes it for the rightful owner", async () => {
      const { getQuarterlyReport } = await import("../data/reports");
      const report = await getQuarterlyReport(alice.id, { year: 2026, quarter: 1 }, "PHP");
      expect(report.paymentCount).toBe(1);
      expect(report.netHome).toBe("57420.00");
      // Gross = net + fees converted at the payment's own rate: 10 * 58 = 580.
      expect(report.feesHome).toBe("580.00");
      expect(report.grossHome).toBe("58000.00");
    });

    it("excludes another user from the CSV export", async () => {
      const { getQuarterlyCsv } = await import("../data/reports");
      const csv = await getQuarterlyCsv(mallory.id, { year: 2026, quarter: 1 }, "PHP");
      // Header only -- no data rows, and no trace of Alice.
      expect(csv.split("\r\n")).toHaveLength(1);
      expect(csv).not.toContain("ALI-0001");
      expect(csv).not.toContain("Alice Secret Client");
    });
  });
});
