import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Account export and deletion, against a real database.
 *
 * Export: the file must hold every record the user owns, at exact precision,
 * and nothing that is a credential or belongs to anyone else.
 *
 * Deletion: removing the user row must leave nothing behind. That is not a
 * given here -- invoice -> client is ON DELETE RESTRICT (a client with invoices
 * cannot be deleted on its own), so this proves the cascade from the user still
 * clears clients, invoices, line items, payments, sessions and credentials in
 * one statement.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("account export and deletion", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL! }),
  });

  const tag = randomUUID().slice(0, 8);
  const owner = { id: randomUUID(), email: `export-${tag}@test.invalid` };
  const other = { id: randomUUID(), email: `bystander-${tag}@test.invalid` };
  const PASSWORD_HASH = `scrypt-hash-${tag}`;
  const SESSION_TOKEN = `session-token-${tag}`;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: owner.id, email: owner.email, name: "Owner", tin: "123-456-789-000", invoiceSeq: 1 },
        { id: other.id, email: other.email, name: "Bystander" },
      ],
    });
    await prisma.account.create({
      data: { id: randomUUID(), accountId: owner.id, providerId: "credential", userId: owner.id, password: PASSWORD_HASH },
    });
    await prisma.session.create({
      data: {
        id: randomUUID(),
        userId: owner.id,
        token: SESSION_TOKEN,
        expiresAt: new Date(Date.now() + 86_400_000),
        ipAddress: "203.0.113.9",
      },
    });

    const client = await prisma.client.create({
      data: { userId: owner.id, name: `Owner Client ${tag}`, email: "c@owner.test", country: "US", currency: "USD" },
    });
    await prisma.invoice.create({
      data: {
        userId: owner.id,
        clientId: client.id,
        number: "INV-0001",
        seq: 1,
        status: "PAID",
        issueDate: new Date("2026-03-01T00:00:00Z"),
        dueDate: new Date("2026-03-15T00:00:00Z"),
        currency: "USD",
        subtotal: "1200.03",
        total: "1200.03",
        lineItems: {
          create: [{ position: 0, description: "Extra hours", quantity: "7.2500000000", unitPrice: "27.59", amount: "200.03" }],
        },
        payments: {
          create: {
            userId: owner.id,
            receivedAt: new Date("2026-03-05T00:00:00Z"),
            currency: "USD",
            amountReceived: "1200.03",
            feeAmount: "14.40",
            netAmount: "1185.63",
            homeCurrency: "PHP",
            fxRate: "57.8512340000",
            homeAmount: "68589.25",
          },
        },
      },
    });
    await prisma.verification.create({
      data: { id: randomUUID(), identifier: `reset-password:${tag}`, value: owner.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    await prisma.client.create({
      data: { userId: other.id, name: `Bystander Client ${tag}`, email: "c@other.test", country: "GB", currency: "GBP" },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.verification.deleteMany({ where: { identifier: `reset-password:${tag}` } });
    await prisma.$disconnect();
  });

  it("exports every record the user owns, at exact precision", async () => {
    const { exportAccount } = await import("../data/account");
    const data = (await exportAccount(owner.id))!;

    expect(data.format).toBe("kitaflux-export/1");
    expect(data.account.email).toBe(owner.email);
    expect(data.account.tin).toBe("123-456-789-000");
    expect(data.account.invoicesIssued).toBe(1);
    expect(data.clients).toHaveLength(1);
    expect(data.invoices).toHaveLength(1);
    expect(data.payments).toHaveLength(1);

    const [invoice] = data.invoices;
    expect(invoice.total).toBe("1200.03");
    expect(invoice.issueDate).toBe("2026-03-01");
    expect(invoice.lineItems[0]).toEqual({
      description: "Extra hours",
      quantity: "7.25",
      unitPrice: "27.59",
      amount: "200.03",
    });
    // Strings, never JSON numbers, so nothing reading the file rounds them.
    expect(data.payments[0].fxRate).toBe("57.851234");
    expect(typeof data.payments[0].homeAmount).toBe("string");
  });

  it("leaves credentials and security telemetry out of the file", async () => {
    const { exportAccount } = await import("../data/account");
    const file = JSON.stringify(await exportAccount(owner.id));
    for (const secret of [PASSWORD_HASH, SESSION_TOKEN, "203.0.113.9", `reset-password:${tag}`]) {
      expect(file).not.toContain(secret);
    }
  });

  it("never includes another user's records", async () => {
    const { exportAccount } = await import("../data/account");
    const bystander = (await exportAccount(other.id))!;
    expect(bystander.invoices).toHaveLength(0);
    expect(bystander.payments).toHaveLength(0);
    expect(JSON.stringify(bystander)).not.toContain(`Owner Client ${tag}`);
    expect(JSON.stringify(await exportAccount(owner.id))).not.toContain(`Bystander Client ${tag}`);
    expect(await exportAccount(randomUUID())).toBeNull();
  });

  it("deleting the user cascades every owned row, and nothing of anyone else's", async () => {
    // Captured before deletion: once the invoice is gone, a relation filter
    // through it would report zero line items whether or not they remain.
    const lineItemIds = (
      await prisma.lineItem.findMany({ where: { invoice: { userId: owner.id } }, select: { id: true } })
    ).map((l) => l.id);
    expect(lineItemIds).toHaveLength(1);

    await prisma.user.delete({ where: { id: owner.id } });

    const where = { userId: owner.id };
    expect(await prisma.client.count({ where })).toBe(0);
    expect(await prisma.invoice.count({ where })).toBe(0);
    expect(await prisma.payment.count({ where })).toBe(0);
    expect(await prisma.session.count({ where })).toBe(0);
    expect(await prisma.account.count({ where })).toBe(0);
    expect(await prisma.lineItem.count({ where: { id: { in: lineItemIds } } })).toBe(0);

    expect(await prisma.client.count({ where: { userId: other.id } })).toBe(1);
  });
});
