"use server";

import { revalidatePath } from "next/cache";

import { parseDateInput } from "@/lib/dates";
import { paymentSchema } from "@/lib/validation";

import { getInvoice } from "../data/invoices";
import { deletePayment, recordPayment } from "../data/payments";
import { getRate } from "../fx-service";
import { requireSessionUser, requireUserId } from "../session";
import { field, toActionState, type ActionState } from "./shared";

export async function recordPaymentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireSessionUser();
    const values = paymentSchema.parse({
      invoiceId: field(form, "invoiceId"),
      receivedAt: field(form, "receivedAt"),
      currency: field(form, "currency").toUpperCase(),
      amountReceived: field(form, "amountReceived"),
      feeAmount: field(form, "feeAmount") || "0",
      fxRate: field(form, "fxRate"),
      fxRateSource: field(form, "fxRateSource") || "manual",
      reference: field(form, "reference"),
      note: field(form, "note"),
    });

    await recordPayment(user.id, {
      invoiceId: values.invoiceId,
      receivedAt: parseDateInput(values.receivedAt),
      currency: values.currency,
      amountReceived: values.amountReceived,
      feeAmount: values.feeAmount,
      homeCurrency: user.homeCurrency,
      fxRate: values.fxRate,
      fxRateSource: values.fxRateSource,
      reference: values.reference || null,
      note: values.note || null,
    });

    revalidatePath("/dashboard");
    revalidatePath("/payments");
    revalidatePath("/reports");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${values.invoiceId}`);
    return { ok: true, message: "Payment recorded." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deletePaymentAction(paymentId: string): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const done = await deletePayment(userId, paymentId);
    if (!done) return { ok: false, message: "That payment does not exist." };

    revalidatePath("/dashboard");
    revalidatePath("/payments");
    revalidatePath("/reports");
    revalidatePath("/invoices");
    return { ok: true, message: "Payment removed." };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Look up the reference rate for a date, so the payment form can pre-fill it.
 *
 * Returns a *suggestion*, never a commitment. The user is expected to replace
 * it with the rate their bank actually gave them, which is always worse than
 * the mid-market rate this returns.
 */
export async function lookupRateAction(input: {
  invoiceId: string;
  date: string;
  currency: string;
}): Promise<
  | { ok: true; rate: string; source: string; quoteDate: string; sameCurrency: boolean }
  | { ok: false; message: string }
> {
  try {
    const user = await requireSessionUser();

    // Scoped even for a read-only rate lookup: without this, an arbitrary
    // invoiceId would confirm whether that invoice exists.
    const invoice = await getInvoice(user.id, input.invoiceId);
    if (!invoice) return { ok: false, message: "That invoice does not exist." };

    const currency = input.currency.toUpperCase();
    const home = user.homeCurrency.toUpperCase();
    if (currency === home) {
      return {
        ok: true,
        rate: "1",
        source: "same currency",
        quoteDate: input.date,
        sameCurrency: true,
      };
    }

    const found = await getRate(currency, home, parseDateInput(input.date));
    if (!found) {
      return {
        ok: false,
        message: "No reference rate available for that date. Enter the rate your bank gave you.",
      };
    }

    return {
      ok: true,
      rate: found.rate.toDecimalPlaces(6).toString(),
      source: found.source,
      quoteDate: found.quoteDate.toISOString().slice(0, 10),
      sameCurrency: false,
    };
  } catch {
    return { ok: false, message: "Could not fetch a rate. Enter it manually." };
  }
}
