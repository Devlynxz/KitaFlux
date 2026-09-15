import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
  deriveStatus,
  INVOICE_STATUSES,
  InvalidTransitionError,
  isEditable,
  isOpen,
  nextStatus,
  type InvoiceEvent,
  type Status,
} from "../invoice-status";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("legal transitions", () => {
  it("walks the happy path draft -> sent -> paid", () => {
    expect(assertTransition("DRAFT", "send")).toBe("SENT");
    expect(assertTransition("SENT", "payment_recorded")).toBe("PAID");
  });

  it("lets a sent invoice lapse into overdue and then be paid", () => {
    expect(assertTransition("SENT", "mark_overdue")).toBe("OVERDUE");
    expect(assertTransition("OVERDUE", "payment_recorded")).toBe("PAID");
  });

  it("returns an overdue invoice to sent when the due date is pushed back", () => {
    expect(assertTransition("OVERDUE", "due_date_extended")).toBe("SENT");
  });

  it("lets removing a payment reopen a paid invoice", () => {
    expect(assertTransition("PAID", "payment_removed")).toBe("SENT");
  });

  it("allows voiding from any open state", () => {
    for (const from of ["DRAFT", "SENT", "OVERDUE"] as Status[]) {
      expect(assertTransition(from, "void")).toBe("VOID");
    }
  });
});

describe("illegal transitions", () => {
  it("refuses to record a payment against a draft", () => {
    // The invoice has no number yet; the client has never seen it.
    expect(() => assertTransition("DRAFT", "payment_recorded")).toThrow(InvalidTransitionError);
  });

  it("refuses to send an invoice twice", () => {
    expect(() => assertTransition("SENT", "send")).toThrow(InvalidTransitionError);
  });

  it("refuses to void a paid invoice, which would orphan a real deposit", () => {
    expect(() => assertTransition("PAID", "void")).toThrow(InvalidTransitionError);
  });

  it("treats void as terminal", () => {
    const events: InvoiceEvent[] = [
      "send",
      "payment_recorded",
      "payment_removed",
      "mark_overdue",
      "due_date_extended",
      "void",
    ];
    for (const e of events) {
      expect(canTransition("VOID", e)).toBe(false);
    }
  });

  it("carries the offending state and event on the error", () => {
    try {
      assertTransition("PAID", "void");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as InvalidTransitionError).from).toBe("PAID");
      expect((err as InvalidTransitionError).event).toBe("void");
    }
  });

  it("nextStatus returns null rather than throwing", () => {
    expect(nextStatus("VOID", "send")).toBeNull();
  });
});

describe("deriveStatus", () => {
  const today = d("2026-03-10");

  it("marks an unpaid invoice past its due date overdue", () => {
    expect(
      deriveStatus({ current: "SENT", fullyPaid: false, dueDate: d("2026-03-01"), today }),
    ).toBe("OVERDUE");
  });

  it("leaves an invoice due today alone -- due today is not yet overdue", () => {
    expect(
      deriveStatus({ current: "SENT", fullyPaid: false, dueDate: d("2026-03-10"), today }),
    ).toBe("SENT");
  });

  it("promotes to paid regardless of the due date", () => {
    expect(
      deriveStatus({ current: "OVERDUE", fullyPaid: true, dueDate: d("2026-01-01"), today }),
    ).toBe("PAID");
  });

  it("demotes a paid invoice back to overdue when its payments are removed", () => {
    expect(
      deriveStatus({ current: "PAID", fullyPaid: false, dueDate: d("2026-01-01"), today }),
    ).toBe("OVERDUE");
  });

  it("never resurrects a void invoice", () => {
    expect(
      deriveStatus({ current: "VOID", fullyPaid: true, dueDate: d("2026-01-01"), today }),
    ).toBe("VOID");
  });

  it("never touches a draft, even one past its due date", () => {
    expect(
      deriveStatus({ current: "DRAFT", fullyPaid: false, dueDate: d("2026-01-01"), today }),
    ).toBe("DRAFT");
  });

  it("is idempotent", () => {
    const args = { current: "SENT" as Status, fullyPaid: false, dueDate: d("2026-03-01"), today };
    const once = deriveStatus(args);
    const twice = deriveStatus({ ...args, current: once });
    expect(twice).toBe(once);
  });
});

describe("helpers", () => {
  it("counts only sent and overdue as money still owed", () => {
    expect(INVOICE_STATUSES.filter(isOpen)).toEqual(["SENT", "OVERDUE"]);
  });

  it("only allows editing a draft", () => {
    expect(INVOICE_STATUSES.filter(isEditable)).toEqual(["DRAFT"]);
  });
});
