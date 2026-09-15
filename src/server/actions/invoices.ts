"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseDateInput } from "@/lib/dates";
import { invoiceSchema } from "@/lib/validation";

import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  markInvoiceSent,
  updateInvoice,
  voidInvoice,
} from "../data/invoices";
import { sendInvoiceEmail } from "../email";
import { requireUserId } from "../session";
import { field, lineItemsFromForm, toActionState, type ActionState } from "./shared";

function parse(form: FormData) {
  return invoiceSchema.parse({
    clientId: field(form, "clientId"),
    issueDate: field(form, "issueDate"),
    dueDate: field(form, "dueDate"),
    currency: field(form, "currency").toUpperCase(),
    taxRate: field(form, "taxRate") || "0",
    notes: field(form, "notes"),
    terms: field(form, "terms"),
    lineItems: lineItemsFromForm(form),
  });
}

export async function createInvoiceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const userId = await requireUserId();
    const values = parse(form);
    const invoice = await createInvoice(userId, {
      ...values,
      issueDate: parseDateInput(values.issueDate),
      dueDate: parseDateInput(values.dueDate),
      notes: values.notes || null,
      terms: values.terms || null,
    });
    id = invoice.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}

export async function updateInvoiceAction(
  invoiceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const values = parse(form);
    await updateInvoice(userId, invoiceId, {
      ...values,
      issueDate: parseDateInput(values.issueDate),
      dueDate: parseDateInput(values.dueDate),
      notes: values.notes || null,
      terms: values.terms || null,
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}

/**
 * Send the invoice: mint the number, flip to SENT, then email the PDF.
 *
 * The state change is committed *before* the email is attempted. If Resend is
 * down, the invoice is still legitimately sent-and-numbered and the user is
 * told the email failed, rather than losing the transition and getting a
 * duplicate number on retry. Delivery is the recoverable half; numbering is not.
 */
export async function sendInvoiceAction(invoiceId: string): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { number } = await markInvoiceSent(userId, invoiceId);

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/dashboard");

    const invoice = await getInvoice(userId, invoiceId);
    if (!invoice) return { ok: false, message: "That invoice does not exist." };

    const delivery = await sendInvoiceEmail(invoice);

    if (delivery.status === "skipped") {
      return {
        ok: true,
        message: `Invoice ${number} is marked as sent. Email is not configured, so nothing was sent to the client — download the PDF and send it yourself.`,
      };
    }
    if (delivery.status === "failed") {
      return {
        ok: false,
        message: `Invoice ${number} is marked as sent, but the email failed: ${delivery.error}. Download the PDF and send it manually.`,
      };
    }
    return { ok: true, message: `Invoice ${number} emailed to ${invoice.client.email}.` };
  } catch (error) {
    return toActionState(error);
  }
}

/** Re-send an already-sent invoice. Does not change status or number. */
export async function resendInvoiceAction(invoiceId: string): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const invoice = await getInvoice(userId, invoiceId);
    if (!invoice) return { ok: false, message: "That invoice does not exist." };
    if (invoice.status === "DRAFT") {
      return { ok: false, message: "Send this invoice first." };
    }

    const delivery = await sendInvoiceEmail(invoice);
    if (delivery.status === "skipped") {
      return { ok: false, message: "Email is not configured. Add RESEND_API_KEY to send invoices." };
    }
    if (delivery.status === "failed") {
      return { ok: false, message: `The email failed: ${delivery.error}` };
    }
    return { ok: true, message: `Sent again to ${invoice.client.email}.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function voidInvoiceAction(invoiceId: string): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    await voidInvoice(userId, invoiceId);

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Invoice voided." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteInvoiceAction(invoiceId: string): Promise<ActionState> {
  let deleted: boolean;
  try {
    const userId = await requireUserId();
    deleted = await deleteInvoice(userId, invoiceId);
  } catch (error) {
    return toActionState(error);
  }

  if (!deleted) {
    return {
      ok: false,
      message: "Only drafts can be deleted. Void this invoice instead so the number stays in your series.",
    };
  }

  revalidatePath("/invoices");
  redirect("/invoices");
}
