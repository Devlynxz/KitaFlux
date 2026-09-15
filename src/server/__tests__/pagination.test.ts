import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Paginated lists, against a real database.
 *
 * The failure offset paging invites is quiet: when rows tie on the sort key --
 * a batch of invoices issued the same day, payments that landed together --
 * Postgres may return the tied rows in a different order for each query, so a
 * row shows up on two pages and another on none. Every row here shares the
 * same dates on purpose, leaving only the id tiebreaker to hold the order.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("paginated lists", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL! }),
  });

  const tag = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const INVOICES = 23;
  const PAGE = 5;

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: userId, email: `page-${tag}@test.invalid`, name: "Pager", homeCurrency: "PHP" },
    });
    const client = await prisma.client.create({
      data: { userId, name: "Same Day Co", email: "same@day.test", country: "US", currency: "USD" },
    });

    const sameDay = new Date("2026-05-01T00:00:00Z");
    const createdAt = new Date("2026-05-01T08:00:00Z");
    for (let i = 1; i <= INVOICES; i++) {
      await prisma.invoice.create({
        data: {
          userId,
          clientId: client.id,
          number: `PG-${String(i).padStart(4, "0")}`,
          seq: i,
          status: "SENT",
          issueDate: sameDay,
          dueDate: new Date("2026-05-15T00:00:00Z"),
          currency: "USD",
          subtotal: "100.00",
          total: "100.00",
          createdAt,
          payments: {
            create: {
              userId,
              receivedAt: sameDay,
              currency: "USD",
              amountReceived: "10.00",
              feeAmount: "0.33",
              netAmount: "9.67",
              homeCurrency: "PHP",
              // 0.33 * 57.8551 = 19.092183 -> 19.09 per row once rounded.
              fxRate: "57.8551",
              homeAmount: "559.46",
              createdAt,
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns every invoice exactly once across pages, even when sort keys tie", async () => {
    const { listInvoices } = await import("../data/invoices");

    const first = await listInvoices(userId, { page: 1, pageSize: PAGE });
    expect(first.total).toBe(INVOICES);
    expect(first.pageCount).toBe(5);

    const seen: string[] = [];
    for (let page = 1; page <= first.pageCount; page++) {
      const result = await listInvoices(userId, { page, pageSize: PAGE });
      expect(result.page).toBe(page);
      seen.push(...result.items.map((i) => i.id));
    }

    expect(seen).toHaveLength(INVOICES);
    expect(new Set(seen).size).toBe(INVOICES);
  });

  it("clamps a page past the end to the last page", async () => {
    const { listInvoices } = await import("../data/invoices");
    const result = await listInvoices(userId, { page: 99, pageSize: PAGE });
    expect(result.page).toBe(5);
    expect(result.items).toHaveLength(INVOICES - PAGE * 4);
  });

  it("counts the filtered total, not the unfiltered one", async () => {
    const { listInvoices } = await import("../data/invoices");
    const drafts = await listInvoices(userId, { status: ["DRAFT"], pageSize: PAGE });
    expect(drafts.total).toBe(0);
    expect(drafts.pageCount).toBe(1);

    const one = await listInvoices(userId, { search: "PG-0007", pageSize: PAGE });
    expect(one.total).toBe(1);
  });

  it("pages payments with the same guarantees", async () => {
    const { listPayments } = await import("../data/payments");
    const seen: string[] = [];
    for (let page = 1; page <= 5; page++) {
      seen.push(...(await listPayments(userId, { page, pageSize: PAGE })).items.map((p) => p.id));
    }
    expect(new Set(seen).size).toBe(INVOICES);
  });

  it("summarises every payment, not just the page on screen", async () => {
    const { summarizePayments } = await import("../data/payments");
    const summary = await summarizePayments(userId);

    expect(summary.count).toBe(INVOICES);
    expect(summary.homeTotal.toFixed(2)).toBe((559.46 * INVOICES).toFixed(2));
    // Rounded per row, as the quarterly report does: 19.09 * 23, not
    // round(19.092183 * 23) = 439.12.
    expect(summary.feesHome.toFixed(2)).toBe("439.07");
  });

  it("returns an empty summary for another user", async () => {
    const { summarizePayments } = await import("../data/payments");
    const summary = await summarizePayments(randomUUID());
    expect(summary.count).toBe(0);
    expect(summary.homeTotal.isZero()).toBe(true);
  });

  it("pages clients", async () => {
    const { listClients } = await import("../data/clients");
    const result = await listClients(userId, { page: 1, pageSize: PAGE });
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe("Same Day Co");
  });
});
