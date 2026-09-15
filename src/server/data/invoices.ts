import "server-only";

import { Decimal, invoiceTotals, toDecimal, toStorage } from "@/lib/money";
import { toUtcDate, todayUtc } from "@/lib/dates";
import { PAGE_SIZE, pageBounds, type Page } from "@/lib/pagination";
import {
  assertTransition,
  deriveStatus,
  isEditable,
  type Status,
} from "@/lib/invoice-status";

import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "../db";
import { reserveInvoiceNumber } from "../invoice-number";

/**
 * Invoice data access.
 *
 * Same isolation rule as clients: userId is always the first argument and is
 * always in the where clause. Additionally, any write that touches an invoice's
 * client verifies that the client belongs to the same user -- otherwise a
 * crafted clientId would attach someone else's client to your invoice.
 */

export interface InvoiceLineInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceInput {
  clientId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  taxRate: string;
  notes?: string | null;
  terms?: string | null;
  lineItems: InvoiceLineInput[];
}

export class InvoiceNotFoundError extends Error {
  constructor() {
    super("That invoice does not exist.");
    this.name = "InvoiceNotFoundError";
  }
}

export class InvoiceLockedError extends Error {
  constructor(status: Status) {
    super(
      `This invoice is ${status.toLowerCase()} and can no longer be edited. ` +
        `Void it and issue a new one if the figures are wrong.`,
    );
    this.name = "InvoiceLockedError";
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super("That client does not exist.");
    this.name = "ClientNotFoundError";
  }
}

/** Confirms a client is the caller's before it can be attached to an invoice. */
async function assertOwnsClient(
  db: Prisma.TransactionClient,
  userId: string,
  clientId: string,
): Promise<void> {
  const client = await db.client.findFirst({
    where: { id: clientId, userId },
    select: { id: true },
  });
  if (!client) throw new ClientNotFoundError();
}

/**
 * Lock one invoice row for the rest of the transaction and return its status.
 *
 * Every status-dependent write reads the status *under this lock*. Without it,
 * two requests can both read DRAFT and both act on it: a double-clicked "Send"
 * mints two numbers and the second overwrites the first -- a gap in a series
 * that is supposed to be gapless -- and an edit can land on an invoice that was
 * sent a millisecond earlier. Scoped by userId like every other query here.
 */
export async function lockInvoice(
  tx: Prisma.TransactionClient,
  userId: string,
  invoiceId: string,
): Promise<{ id: string; status: Status; number: string | null; currency: string } | null> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; status: Status; number: string | null; currency: string }>
  >`
    SELECT "id", "status", "number", "currency"
    FROM "invoice"
    WHERE "id" = ${invoiceId} AND "userId" = ${userId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

// --- Reads ------------------------------------------------------------------

export interface InvoiceListItem {
  id: string;
  number: string | null;
  status: Status;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  total: string;
  amountPaid: string;
  clientName: string;
  clientId: string;
}

export async function listInvoices(
  userId: string,
  opts: {
    status?: Status[];
    clientId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Page<InvoiceListItem>> {
  const where = {
    userId,
    ...(opts.status?.length ? { status: { in: opts.status } } : {}),
    ...(opts.clientId ? { clientId: opts.clientId } : {}),
    ...(opts.search
      ? {
          OR: [
            { number: { contains: opts.search, mode: "insensitive" as const } },
            { client: { name: { contains: opts.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const total = await prisma.invoice.count({ where });
  const { page, pageCount, skip, take } = pageBounds(total, opts.page ?? 1, pageSize);

  const rows = await prisma.invoice.findMany({
    where,
    // id last: issue dates repeat, and an offset page needs a total order.
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      dueDate: true,
      currency: true,
      total: true,
      clientId: true,
      client: { select: { name: true } },
      payments: { select: { amountReceived: true } },
    },
  });

  const items = rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    currency: r.currency,
    total: toStorage(r.total, r.currency),
    amountPaid: toStorage(
      r.payments.reduce((acc, p) => acc.plus(toDecimal(p.amountReceived)), new Decimal(0)),
      r.currency,
    ),
    clientName: r.client.name,
    clientId: r.clientId,
  }));

  return { items, total, page, pageSize, pageCount };
}

/** Full invoice with lines, payments and client. Used by detail, PDF and email. */
export async function getInvoice(userId: string, invoiceId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      client: true,
      lineItems: { orderBy: { position: "asc" } },
      payments: { orderBy: { receivedAt: "desc" } },
    },
  });
}

export type FullInvoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/** Sum of gross amounts received against an invoice, in the invoice currency. */
export function amountPaid(invoice: {
  currency: string;
  payments: Array<{ amountReceived: unknown }>;
}): Decimal {
  return invoice.payments.reduce(
    (acc, p) => acc.plus(toDecimal(p.amountReceived as string)),
    new Decimal(0),
  );
}

export function isFullyPaid(invoice: {
  currency: string;
  total: unknown;
  payments: Array<{ amountReceived: unknown }>;
}): boolean {
  // "Covers the total" rather than "equals the total": clients routinely round
  // up, and an invoice overpaid by 40 cents is paid.
  return amountPaid(invoice).greaterThanOrEqualTo(toDecimal(invoice.total as string));
}

// --- Writes -----------------------------------------------------------------

/**
 * Create a draft. No number is minted here -- see invoice-number.ts for why
 * abandoned drafts must not consume a number.
 */
export async function createInvoice(userId: string, input: InvoiceInput) {
  await assertOwnsClient(prisma, userId, input.clientId);

  const totals = invoiceTotals(input.lineItems, input.taxRate, input.currency);

  return prisma.invoice.create({
    data: {
      userId,
      clientId: input.clientId,
      status: "DRAFT",
      issueDate: toUtcDate(input.issueDate),
      dueDate: toUtcDate(input.dueDate),
      currency: input.currency,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      taxRate: input.taxRate,
      subtotal: toStorage(totals.subtotal, input.currency),
      taxAmount: toStorage(totals.taxAmount, input.currency),
      total: toStorage(totals.total, input.currency),
      lineItems: {
        create: input.lineItems.map((l, i) => ({
          position: i,
          description: l.description,
          quantity: l.quantity,
          unitPrice: toStorage(l.unitPrice, input.currency),
          amount: toStorage(
            toDecimal(l.quantity).times(toDecimal(l.unitPrice)),
            input.currency,
          ),
        })),
      },
    },
  });
}

/** Edit a draft. Refuses anything that has left DRAFT. */
export async function updateInvoice(userId: string, invoiceId: string, input: InvoiceInput) {
  const totals = invoiceTotals(input.lineItems, input.taxRate, input.currency);

  // Lines are replaced wholesale rather than diffed: they have no identity a
  // user cares about, and a replace cannot leave a stale row behind.
  return prisma.$transaction(async (tx) => {
    // The editable check happens under the row lock, so a concurrent send
    // either commits first (and this sees SENT) or waits for this to finish.
    const existing = await lockInvoice(tx, userId, invoiceId);
    if (!existing) throw new InvoiceNotFoundError();
    if (!isEditable(existing.status)) throw new InvoiceLockedError(existing.status);

    await assertOwnsClient(tx, userId, input.clientId);

    await tx.lineItem.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        clientId: input.clientId,
        issueDate: toUtcDate(input.issueDate),
        dueDate: toUtcDate(input.dueDate),
        currency: input.currency,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        taxRate: input.taxRate,
        subtotal: toStorage(totals.subtotal, input.currency),
        taxAmount: toStorage(totals.taxAmount, input.currency),
        total: toStorage(totals.total, input.currency),
        lineItems: {
          create: input.lineItems.map((l, i) => ({
            position: i,
            description: l.description,
            quantity: l.quantity,
            unitPrice: toStorage(l.unitPrice, input.currency),
            amount: toStorage(
              toDecimal(l.quantity).times(toDecimal(l.unitPrice)),
              input.currency,
            ),
          })),
        },
      },
    });
  });
}

/**
 * DRAFT -> SENT, minting the invoice number.
 *
 * The number reservation and the status change share one transaction, so a
 * failure anywhere rolls the counter back and the number is reused. Idempotent:
 * re-sending an already-sent invoice keeps its existing number rather than
 * minting a second one.
 */
export async function markInvoiceSent(
  userId: string,
  invoiceId: string,
): Promise<{ id: string; number: string }> {
  return prisma.$transaction(async (tx) => {
    // Locked, so a second concurrent send of the same draft waits here and
    // then sees the number the first one minted instead of minting another.
    const invoice = await lockInvoice(tx, userId, invoiceId);
    if (!invoice) throw new InvoiceNotFoundError();

    // Already sent: a resend is not a state transition.
    if (invoice.status !== "DRAFT" && invoice.number) {
      return { id: invoice.id, number: invoice.number };
    }

    const status = assertTransition(invoice.status, "send");
    const { seq, number } = await reserveInvoiceNumber(tx, userId);

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status, number, seq, sentAt: new Date() },
    });

    return { id: invoiceId, number };
  });
}

export async function voidInvoice(userId: string, invoiceId: string) {
  await prisma.$transaction(async (tx) => {
    // Under the lock, so a payment that completes the invoice at the same
    // moment is seen here as PAID and the void is refused.
    const invoice = await lockInvoice(tx, userId, invoiceId);
    if (!invoice) throw new InvoiceNotFoundError();

    const status = assertTransition(invoice.status, "void");
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status, voidedAt: new Date() },
    });
  });
  // The number is deliberately kept. A void invoice that vanished from the
  // series would look like a deleted one to an auditor.
}

export async function deleteInvoice(userId: string, invoiceId: string): Promise<boolean> {
  // Only drafts can be deleted; anything numbered stays in the series forever.
  const result = await prisma.invoice.deleteMany({
    where: { id: invoiceId, userId, status: "DRAFT" },
  });
  return result.count > 0;
}

/**
 * Recompute a single invoice's status from its payments and due date.
 * Called after any payment write, and by the nightly sweep.
 */
export async function refreshInvoiceStatus(
  userId: string,
  invoiceId: string,
  today: Date = todayUtc(),
  db: Prisma.TransactionClient = prisma,
): Promise<Status | null> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: {
      id: true,
      status: true,
      total: true,
      currency: true,
      dueDate: true,
      paidAt: true,
      payments: { select: { amountReceived: true } },
    },
  });
  if (!invoice) return null;

  const fullyPaid = isFullyPaid(invoice);
  const next = deriveStatus({
    current: invoice.status,
    fullyPaid,
    dueDate: invoice.dueDate,
    today,
  });

  if (next === invoice.status) return next;

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      status: next,
      paidAt: next === "PAID" ? (invoice.paidAt ?? new Date()) : null,
    },
  });
  return next;
}

/**
 * Sweep every open invoice for a user past its due date into OVERDUE.
 * Cheap enough to run on dashboard load, and also run by the scheduled job.
 */
export async function sweepOverdue(userId: string, today: Date = todayUtc()): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: { userId, status: "SENT", dueDate: { lt: today } },
    data: { status: "OVERDUE" },
  });
  return result.count;
}
