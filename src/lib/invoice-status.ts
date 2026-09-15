/**
 * Invoice state machine.
 *
 * The whole point of writing this as one table is that no other file is allowed
 * to set `status` directly. Every write goes through `assertTransition`, so an
 * illegal move fails loudly at the boundary instead of leaving a paid invoice
 * sitting in DRAFT because some handler forgot a guard.
 *
 *   DRAFT ──send──▶ SENT ──payment covers total──▶ PAID
 *     │              │  ▲                            │
 *     │              │  └────── due date extended ───┤ (via OVERDUE)
 *     │              ▼                               │
 *     │           OVERDUE ──payment covers total────▶┘
 *     │              │
 *     └──────────────┴──────void──────────────────▶ VOID
 *
 * Notes on the shape of this machine:
 *
 * - OVERDUE is stored, not derived on read. It has to be, because the reminder
 *   job queries for it and a derived status cannot be indexed. `deriveStatus`
 *   below recomputes it so the stored value can be reconciled by a scheduled
 *   sweep; the UI trusts the stored value.
 *
 * - There is no PARTIALLY_PAID state. The spec lists five statuses and partial
 *   payment is a property of the money, not of the document: an invoice with
 *   one of two payments recorded is still an unpaid invoice that should still
 *   chase the client. Progress is shown from amountPaid vs total instead.
 *
 * - PAID is terminal. Money that arrived cannot un-arrive; the way back is to
 *   delete the payment, which re-runs the machine from the remaining payments.
 *
 * - VOID is terminal and unconditional from any non-PAID state. Voiding a paid
 *   invoice is refused: it would orphan a real bank deposit.
 */
import type { InvoiceStatus } from "@/generated/prisma/enums";

export type Status = InvoiceStatus;

export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "PAID",
  "OVERDUE",
  "VOID",
] as const;

/**
 * Events, not target states. "mark it SENT" is ambiguous about whether a number
 * should be minted; "send" is not.
 */
export type InvoiceEvent =
  | "send"
  | "payment_recorded"
  | "payment_removed"
  | "mark_overdue"
  | "due_date_extended"
  | "void";

const TRANSITIONS: Record<Status, Partial<Record<InvoiceEvent, Status>>> = {
  DRAFT: {
    send: "SENT",
    void: "VOID",
  },
  SENT: {
    payment_recorded: "PAID",
    mark_overdue: "OVERDUE",
    void: "VOID",
  },
  OVERDUE: {
    payment_recorded: "PAID",
    due_date_extended: "SENT",
    void: "VOID",
  },
  PAID: {
    payment_removed: "SENT",
  },
  VOID: {},
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: Status,
    readonly event: InvoiceEvent,
  ) {
    super(`Cannot ${event.replace(/_/g, " ")} an invoice that is ${from.toLowerCase()}.`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: Status, event: InvoiceEvent): boolean {
  return TRANSITIONS[from][event] !== undefined;
}

export function nextStatus(from: Status, event: InvoiceEvent): Status | null {
  return TRANSITIONS[from][event] ?? null;
}

/** Throws unless the move is legal. The only sanctioned way to change status. */
export function assertTransition(from: Status, event: InvoiceEvent): Status {
  const to = nextStatus(from, event);
  if (to === null) throw new InvalidTransitionError(from, event);
  return to;
}

/**
 * What a status *should* be, given the facts. Used by the nightly sweep and by
 * payment handlers, so the same rule is not written twice.
 *
 * `fullyPaid` is decided by the caller in Decimal space -- this module never
 * touches money.
 */
export function deriveStatus(args: {
  current: Status;
  fullyPaid: boolean;
  dueDate: Date;
  today: Date;
}): Status {
  const { current, fullyPaid, dueDate, today } = args;

  // Terminal states and drafts are never recomputed from the outside.
  if (current === "VOID" || current === "DRAFT") return current;

  if (fullyPaid) return "PAID";

  // A previously-paid invoice whose payments were removed falls back to the
  // open ladder rather than staying PAID.
  const overdue = startOfDay(dueDate).getTime() < startOfDay(today).getTime();
  return overdue ? "OVERDUE" : "SENT";
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Statuses that represent money still owed. */
export const OPEN_STATUSES: Status[] = ["SENT", "OVERDUE"];

export function isOpen(status: Status): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isEditable(status: Status): boolean {
  // Once a client has the document, its figures are frozen.
  return status === "DRAFT";
}

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};
