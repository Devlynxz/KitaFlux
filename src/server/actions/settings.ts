"use server";

import { revalidatePath } from "next/cache";

import { settingsSchema } from "@/lib/validation";

import { prisma } from "../db";
import { requireUserId } from "../session";
import { field, toActionState, type ActionState } from "./shared";

export async function updateSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const values = settingsSchema.parse({
      name: field(form, "name"),
      businessName: field(form, "businessName"),
      tin: field(form, "tin"),
      addressLine: field(form, "addressLine"),
      city: field(form, "city"),
      country: field(form, "country").toUpperCase(),
      defaultCurrency: field(form, "defaultCurrency").toUpperCase(),
      homeCurrency: field(form, "homeCurrency").toUpperCase(),
      paymentDetails: field(form, "paymentDetails"),
      invoicePrefix: field(form, "invoicePrefix").toUpperCase(),
      invoiceNotes: field(form, "invoiceNotes"),
    });

    // Every payment stores its home-currency amount at the rate it landed at,
    // and the dashboard and quarterly report sum those amounts. Switching the
    // reporting currency once any exist would add pesos to dollars under one
    // label, so the switch is only allowed on an account with no payments.
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { homeCurrency: true, _count: { select: { payments: true } } },
    });
    if (current && current.homeCurrency !== values.homeCurrency && current._count.payments > 0) {
      return {
        ok: false,
        message: "Check the highlighted fields.",
        errors: {
          homeCurrency: `You have payments recorded in ${current.homeCurrency}, so the reporting currency can no longer change.`,
        },
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: values.name,
        businessName: values.businessName || null,
        tin: values.tin || null,
        addressLine: values.addressLine || null,
        city: values.city || null,
        country: values.country,
        defaultCurrency: values.defaultCurrency,
        homeCurrency: values.homeCurrency,
        paymentDetails: values.paymentDetails || null,
        invoicePrefix: values.invoicePrefix,
        invoiceNotes: values.invoiceNotes || null,
        // invoiceSeq is deliberately absent: the counter is owned by
        // reserveInvoiceNumber and must never be settable from a form.
      },
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return toActionState(error);
  }
}
