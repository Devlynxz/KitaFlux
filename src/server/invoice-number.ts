import type { Prisma } from "@/generated/prisma/client";

/**
 * Invoice numbering.
 *
 * Requirements: sequential per user, gapless, and correct when two invoices are
 * created in the same millisecond.
 *
 * Why the obvious approaches are wrong:
 *
 *   count() + 1        - two concurrent requests both read N and both write
 *                        N+1. One fails on the unique constraint, or worse,
 *                        both succeed if the constraint is missing.
 *   max(seq) + 1       - same race, and it silently reuses a number after a
 *                        delete.
 *   a Postgres SEQUENCE - concurrency-safe but *not gapless*: a rolled-back
 *                        transaction burns the value permanently. Fine for
 *                        surrogate keys, not for a document series that an
 *                        auditor reads as evidence nothing was removed.
 *   autoincrement()    - the same sequence problem, plus it is global rather
 *                        than per user.
 *
 * What this does instead: take a row-level lock on the user row, read the
 * counter, increment it, and mint the number, all inside one transaction. The
 * second concurrent request blocks on the lock until the first commits, then
 * reads the already-incremented value. Because the counter and the invoice are
 * written in the same transaction, a rollback returns the number to the pool --
 * which is what makes it gapless rather than merely unique.
 *
 * The lock is per user, so two different freelancers never contend.
 *
 * `@@unique([userId, seq])` and `@@unique([userId, number])` remain in the
 * schema as assertions. If this function is ever bypassed, the database refuses
 * the write rather than quietly producing a duplicate.
 */

/** Width of the zero-padded counter: INV-0001. Rolls over cleanly past 9999. */
const PAD = 4;

export function formatInvoiceNumber(prefix: string, seq: number): string {
  const clean = prefix.trim().replace(/[^A-Za-z0-9-]/g, "").toUpperCase() || "INV";
  return `${clean}-${String(seq).padStart(PAD, "0")}`;
}

/**
 * Reserve the next number for a user.
 *
 * MUST be called inside an interactive transaction, and the invoice write MUST
 * happen in that same transaction. Calling it standalone would commit the
 * increment immediately and reintroduce the gap it exists to prevent.
 */
export async function reserveInvoiceNumber(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ seq: number; number: string }> {
  // FOR UPDATE serialises concurrent callers on this user's row. Prisma has no
  // typed API for row locks, so this is raw -- parameterised, not interpolated.
  const locked = await tx.$queryRaw<Array<{ invoiceSeq: number; invoicePrefix: string }>>`
    SELECT "invoiceSeq", "invoicePrefix"
    FROM "user"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;

  if (locked.length === 0) {
    throw new Error(`Cannot reserve an invoice number: no user ${userId}.`);
  }

  const { invoiceSeq, invoicePrefix } = locked[0];
  const seq = Number(invoiceSeq) + 1;

  await tx.user.update({
    where: { id: userId },
    data: { invoiceSeq: seq },
  });

  return { seq, number: formatInvoiceNumber(invoicePrefix, seq) };
}

/**
 * Preview the number an invoice *would* get, for display on a draft.
 *
 * Deliberately does not lock or reserve. It is a hint, and the UI labels it as
 * one -- the real number is minted when the invoice is sent.
 */
export async function peekNextInvoiceNumber(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { invoiceSeq: true, invoicePrefix: true },
  });
  if (!user) throw new Error(`No user ${userId}.`);
  return formatInvoiceNumber(user.invoicePrefix, user.invoiceSeq + 1);
}
