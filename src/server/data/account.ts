import "server-only";

import { toDecimal, toStorage } from "@/lib/money";

import { prisma } from "../db";

/**
 * Account data export: everything KitaFlux holds about one user, as JSON.
 *
 * Exists for two reasons. A person has the right to a copy of their data
 * (the Data Privacy Act's right to data portability). And a freelancer must keep their
 * books for years after filing -- so before anyone deletes their account,
 * they need a way to take their records with them.
 *
 * Included: the profile as it prints on invoices, every client, every invoice
 * with its line items, every payment with the rate it landed at. Amounts are
 * decimal strings at storage precision, never JSON numbers -- a spreadsheet or
 * script reading this must not round a peso figure on the way in.
 *
 * Excluded, deliberately: the password hash, session and verification tokens,
 * and IP addresses Better Auth records against sessions. They are credentials
 * or security telemetry, not the user's records, and a downloaded file is far
 * easier to leak than the database it came from.
 *
 * Scoped by userId like every other function in this layer.
 */

export const EXPORT_FORMAT = "kitaflux-export/1";

export async function exportAccount(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      businessName: true,
      tin: true,
      addressLine: true,
      city: true,
      country: true,
      defaultCurrency: true,
      homeCurrency: true,
      paymentDetails: true,
      invoicePrefix: true,
      invoiceNotes: true,
      invoiceSeq: true,
    },
  });
  if (!user) return null;

  const [clients, invoices, payments] = await Promise.all([
    prisma.client.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        country: true,
        currency: true,
        addressLine: true,
        notes: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { userId },
      orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { lineItems: { orderBy: { position: "asc" } } },
    }),
    prisma.payment.findMany({
      where: { userId },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const time = (d: Date | null) => (d ? d.toISOString() : null);

  const { invoiceSeq, createdAt, ...profile } = user;

  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    account: { ...profile, createdAt: time(createdAt), invoicesIssued: invoiceSeq },
    clients: clients.map((c) => ({
      ...c,
      archivedAt: time(c.archivedAt),
      createdAt: time(c.createdAt),
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      clientId: inv.clientId,
      number: inv.number,
      status: inv.status,
      issueDate: date(inv.issueDate),
      dueDate: date(inv.dueDate),
      currency: inv.currency,
      subtotal: toStorage(inv.subtotal, inv.currency),
      taxRate: toDecimal(inv.taxRate).toString(),
      taxAmount: toStorage(inv.taxAmount, inv.currency),
      total: toStorage(inv.total, inv.currency),
      notes: inv.notes,
      terms: inv.terms,
      sentAt: time(inv.sentAt),
      paidAt: time(inv.paidAt),
      voidedAt: time(inv.voidedAt),
      createdAt: time(inv.createdAt),
      lineItems: inv.lineItems.map((l) => ({
        description: l.description,
        quantity: toDecimal(l.quantity).toString(),
        unitPrice: toStorage(l.unitPrice, inv.currency),
        amount: toStorage(l.amount, inv.currency),
      })),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      receivedAt: date(p.receivedAt),
      currency: p.currency,
      amountReceived: toStorage(p.amountReceived, p.currency),
      feeAmount: toStorage(p.feeAmount, p.currency),
      netAmount: toStorage(p.netAmount, p.currency),
      fxRate: toDecimal(p.fxRate).toString(),
      fxRateSource: p.fxRateSource,
      homeCurrency: p.homeCurrency,
      homeAmount: toStorage(p.homeAmount, p.homeCurrency),
      reference: p.reference,
      note: p.note,
      createdAt: time(p.createdAt),
    })),
  };
}

export type AccountExport = NonNullable<Awaited<ReturnType<typeof exportAccount>>>;
