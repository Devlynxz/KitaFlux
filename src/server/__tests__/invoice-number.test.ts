import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { formatInvoiceNumber, reserveInvoiceNumber } from "../invoice-number";

/**
 * Invoice numbering.
 *
 * The spec's requirement is "sequential per user, gapless, and safe when two
 * invoices are created at the same time". The concurrency half of that claim
 * cannot be tested without a real database and real concurrent transactions,
 * so this suite runs against Postgres and actually races.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describe("formatInvoiceNumber", () => {
  it("zero-pads to four digits", () => {
    expect(formatInvoiceNumber("INV", 1)).toBe("INV-0001");
    expect(formatInvoiceNumber("INV", 42)).toBe("INV-0042");
  });

  it("keeps growing past four digits rather than wrapping", () => {
    expect(formatInvoiceNumber("INV", 12345)).toBe("INV-12345");
  });

  it("normalises the prefix and strips anything unsafe", () => {
    expect(formatInvoiceNumber("sds", 7)).toBe("SDS-0007");
    expect(formatInvoiceNumber("a b/c", 7)).toBe("ABC-0007");
  });

  it("falls back to INV when a prefix reduces to nothing", () => {
    expect(formatInvoiceNumber("///", 7)).toBe("INV-0007");
    expect(formatInvoiceNumber("", 7)).toBe("INV-0007");
  });
});

describeDb("reserveInvoiceNumber", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL! }),
  });

  const tag = randomUUID().slice(0, 8);
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: userA, email: `numa-${tag}@test.invalid`, name: "A", invoicePrefix: "AAA" },
        { id: userB, email: `numb-${tag}@test.invalid`, name: "B", invoicePrefix: "BBB" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it("issues consecutive numbers", async () => {
    const first = await prisma.$transaction((tx) => reserveInvoiceNumber(tx, userA));
    const second = await prisma.$transaction((tx) => reserveInvoiceNumber(tx, userA));

    expect(first.seq).toBe(1);
    expect(first.number).toBe("AAA-0001");
    expect(second.seq).toBe(2);
    expect(second.number).toBe("AAA-0002");
  });

  it("keeps each user's series independent", async () => {
    const b = await prisma.$transaction((tx) => reserveInvoiceNumber(tx, userB));
    // A is already at 2; B starts at its own 1.
    expect(b.seq).toBe(1);
    expect(b.number).toBe("BBB-0001");
  });

  it("issues no duplicates under concurrent load", async () => {
    // Twenty transactions started at once, all racing for the same user row.
    // Without FOR UPDATE this produces duplicates; with it they serialise.
    const before = await prisma.user.findUnique({
      where: { id: userA },
      select: { invoiceSeq: true },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) => reserveInvoiceNumber(tx, userA)),
      ),
    );

    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    const unique = new Set(seqs);

    expect(unique.size).toBe(20);

    // Gapless: the twenty values are exactly the next twenty integers.
    const start = before!.invoiceSeq + 1;
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => start + i));

    const after = await prisma.user.findUnique({
      where: { id: userA },
      select: { invoiceSeq: true },
    });
    expect(after!.invoiceSeq).toBe(start + 19);
  });

  it("returns the number to the pool when the transaction rolls back", async () => {
    // This is the property a Postgres SEQUENCE does not have, and the reason
    // the counter lives on the user row instead.
    const before = await prisma.user.findUnique({
      where: { id: userB },
      select: { invoiceSeq: true },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await reserveInvoiceNumber(tx, userB);
        throw new Error("simulated failure after reserving");
      }),
    ).rejects.toThrow(/simulated failure/);

    const after = await prisma.user.findUnique({
      where: { id: userB },
      select: { invoiceSeq: true },
    });
    expect(after!.invoiceSeq).toBe(before!.invoiceSeq);

    // The next successful reservation reuses the number, leaving no gap.
    const next = await prisma.$transaction((tx) => reserveInvoiceNumber(tx, userB));
    expect(next.seq).toBe(before!.invoiceSeq + 1);
  });

  it("throws for a user that does not exist", async () => {
    await expect(
      prisma.$transaction((tx) => reserveInvoiceNumber(tx, randomUUID())),
    ).rejects.toThrow(/no user/i);
  });

  it("mints one number when the same draft is sent twice at once", async () => {
    // A double-clicked Send. Without the invoice row lock both requests read
    // DRAFT, both reserve a number, and the second overwrites the first --
    // leaving a hole in the series.
    const { createInvoice, markInvoiceSent } = await import("../data/invoices");
    const { createClient } = await import("../data/clients");

    const client = await createClient(userB, {
      name: "Race Client",
      email: "race@test.invalid",
      country: "US",
      currency: "USD",
    });
    const draft = await createInvoice(userB, {
      clientId: client.id,
      issueDate: new Date("2026-04-01T00:00:00Z"),
      dueDate: new Date("2026-04-15T00:00:00Z"),
      currency: "USD",
      taxRate: "0",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "10" }],
    });

    // Open the app pool's connections first. Otherwise the first send commits
    // before the others have even connected, and the race never happens.
    const { prisma: appPrisma } = await import("../db");
    await Promise.all(
      Array.from({ length: 5 }, () => appPrisma.$transaction((tx) => tx.$queryRaw`SELECT 1 AS ok`)),
    );

    const before = await prisma.user.findUnique({ where: { id: userB }, select: { invoiceSeq: true } });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => markInvoiceSent(userB, draft.id)),
    );
    const after = await prisma.user.findUnique({ where: { id: userB }, select: { invoiceSeq: true } });

    expect(new Set(results.map((r) => r.number)).size).toBe(1);
    expect(after!.invoiceSeq).toBe(before!.invoiceSeq + 1);

    const stored = await prisma.invoice.findUnique({ where: { id: draft.id } });
    expect(stored!.number).toBe(results[0].number);
  });
});
