import { PrismaPg } from "@prisma/adapter-pg";

import { auth } from "../src/server/auth";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Development seed.
 *
 * Creates two users with overlapping-looking data on purpose. The second user
 * exists so that any accidental cross-user leak is visible the moment you look
 * at a page, rather than only in a test.
 *
 * Accounts are created through Better Auth's own sign-up API rather than by
 * inserting rows. Writing an `account` row by hand would bake in an assumption
 * about the hash format, and inserting only a `user` row is worse still: the
 * email is unique, so the account can never be signed into *or* signed up for
 * again -- the demo data ends up permanently unreachable. Going through the API
 * means these credentials work exactly like a real user's.
 */

// Anyone running this seed is running it against a local or throwaway database,
// and the whole point is that the password is known. Never seed production.
export const DEMO_PASSWORD = "kitaflux-demo-2026";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Sign a user up through Better Auth, returning their id. */
async function createAccount(email: string, name: string): Promise<string> {
  const result = await auth.api.signUpEmail({
    body: { email, name, password: DEMO_PASSWORD },
  });
  if (!result?.user?.id) throw new Error(`Could not create ${email}.`);
  return result.user.id;
}

async function main() {
  console.log("Seeding…");

  // Idempotent: wipe the seeded users and cascade, so re-running is safe.
  await prisma.user.deleteMany({
    where: { email: { in: ["maya@example.com", "other@example.com"] } },
  });

  const mayaId = await createAccount("maya@example.com", "Maya Santos");

  // The profile fields are not part of sign-up, so they are applied after.
  const maya = await prisma.user.update({
    where: { id: mayaId },
    data: {
      emailVerified: true,
      businessName: "Santos Design Studio",
      tin: "123-456-789-000",
      addressLine: "14 Kalayaan Avenue, Diliman",
      city: "Quezon City",
      country: "PH",
      defaultCurrency: "USD",
      homeCurrency: "PHP",
      paymentDetails:
        "Wise (USD)\nAccount name: Maya Santos\nRouting: 026073150\nAccount no: 8842013370\nSWIFT: CMFGUS33",
      invoicePrefix: "SDS",
      invoiceSeq: 0,
    },
  });

  // A second tenant. Nothing here should ever appear on Maya's pages.
  const otherId = await createAccount("other@example.com", "Someone Else");
  const other = await prisma.user.update({
    where: { id: otherId },
    data: { emailVerified: true, invoicePrefix: "INV" },
  });

  const acme = await prisma.client.create({
    data: {
      userId: maya.id,
      name: "Jordan Reyes",
      email: "jordan@acme.test",
      company: "Acme Inc.",
      country: "US",
      currency: "USD",
      addressLine: "500 Market Street, San Francisco, CA",
    },
  });

  const northwind = await prisma.client.create({
    data: {
      userId: maya.id,
      name: "Priya Raman",
      email: "priya@northwind.test",
      company: "Northwind Studio",
      country: "GB",
      currency: "GBP",
    },
  });

  await prisma.client.create({
    data: {
      userId: other.id,
      name: "Not Yours Ltd",
      email: "nope@elsewhere.test",
      country: "AU",
      currency: "AUD",
    },
  });

  // --- A paid invoice, with a payment recorded at a historical rate ----------
  const paid = await prisma.invoice.create({
    data: {
      userId: maya.id,
      clientId: acme.id,
      number: "SDS-0001",
      seq: 1,
      status: "PAID",
      issueDate: d("2026-01-05"),
      dueDate: d("2026-01-19"),
      currency: "USD",
      subtotal: "4800.00",
      taxRate: "0",
      taxAmount: "0.00",
      total: "4800.00",
      notes: "January retainer.",
      terms: "Net 14. Bank charges are the payer's responsibility.",
      sentAt: new Date("2026-01-05T09:12:00Z"),
      paidAt: new Date("2026-01-16T02:41:00Z"),
      lineItems: {
        create: [
          {
            position: 0,
            description: "Product design retainer — January",
            quantity: "1",
            unitPrice: "4000.00",
            amount: "4000.00",
          },
          {
            position: 1,
            description: "Design system audit",
            quantity: "8",
            unitPrice: "100.00",
            amount: "800.00",
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      userId: maya.id,
      invoiceId: paid.id,
      receivedAt: d("2026-01-16"),
      currency: "USD",
      amountReceived: "4800.00",
      feeAmount: "38.40",
      netAmount: "4761.60",
      homeCurrency: "PHP",
      fxRate: "58.2100000000",
      // 4761.60 * 58.21 = 277,153.74 (277153.7360 -> half up: 277153.74)
      homeAmount: "277153.74",
      fxRateSource: "manual",
      reference: "WISE-8842013",
      note: "Wise transfer, rate taken from the statement.",
    },
  });

  // --- An overdue invoice, so the dashboard and reminder job have something --
  await prisma.invoice.create({
    data: {
      userId: maya.id,
      clientId: northwind.id,
      number: "SDS-0002",
      seq: 2,
      status: "OVERDUE",
      issueDate: d("2026-02-02"),
      dueDate: d("2026-02-16"),
      currency: "GBP",
      subtotal: "2250.00",
      taxRate: "0",
      taxAmount: "0.00",
      total: "2250.00",
      sentAt: new Date("2026-02-02T10:00:00Z"),
      lineItems: {
        create: [
          {
            position: 0,
            description: "Marketing site build — phase 1",
            quantity: "15",
            unitPrice: "150.00",
            amount: "2250.00",
          },
        ],
      },
    },
  });

  // --- A sent invoice, partly paid, to exercise the balance logic ------------
  const partial = await prisma.invoice.create({
    data: {
      userId: maya.id,
      clientId: acme.id,
      number: "SDS-0003",
      seq: 3,
      status: "SENT",
      issueDate: d("2026-03-01"),
      dueDate: d("2099-12-31"),
      currency: "USD",
      subtotal: "3000.00",
      taxRate: "0",
      taxAmount: "0.00",
      total: "3000.00",
      sentAt: new Date("2026-03-01T08:30:00Z"),
      lineItems: {
        create: [
          {
            position: 0,
            description: "Q1 design sprint",
            quantity: "1",
            unitPrice: "3000.00",
            amount: "3000.00",
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      userId: maya.id,
      invoiceId: partial.id,
      receivedAt: d("2026-03-05"),
      currency: "USD",
      amountReceived: "1200.00",
      feeAmount: "14.40",
      netAmount: "1185.60",
      homeCurrency: "PHP",
      fxRate: "57.8500000000",
      // 1185.60 * 57.85 = 68,586.96
      homeAmount: "68586.96",
      fxRateSource: "manual",
      reference: "WISE-9001222",
      note: "First half.",
    },
  });

  // --- A draft, which must not have a number --------------------------------
  await prisma.invoice.create({
    data: {
      userId: maya.id,
      clientId: northwind.id,
      status: "DRAFT",
      issueDate: d("2026-03-10"),
      dueDate: d("2026-03-24"),
      currency: "GBP",
      subtotal: "900.00",
      taxRate: "0",
      taxAmount: "0.00",
      total: "900.00",
      lineItems: {
        create: [
          {
            position: 0,
            description: "Phase 2 scoping",
            quantity: "6",
            unitPrice: "150.00",
            amount: "900.00",
          },
        ],
      },
    },
  });

  // Three numbers have been issued, so the counter must reflect that or the
  // next send would collide with SDS-0001.
  await prisma.user.update({ where: { id: maya.id }, data: { invoiceSeq: 3 } });

  console.log("");
  console.log(`Seeded ${maya.email} - 3 issued invoices, 1 draft, 2 payments.`);
  console.log(`Seeded ${other.email} - empty, exists to prove data isolation.`);
  console.log("");
  console.log(`Sign in with either email and the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
