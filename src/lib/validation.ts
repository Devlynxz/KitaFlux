import { z } from "zod";

import { SUPPORTED_CURRENCIES, toDecimal } from "./money";
import { parseDateInput } from "./dates";

/**
 * Form validation.
 *
 * Money fields are validated as *strings* and checked by parsing them with
 * decimal.js. `z.number()` would coerce through a float on the way in, which is
 * exactly the thing the money layer exists to prevent -- the value would already
 * have lost precision before any of the careful arithmetic ran.
 *
 * These schemas run on the server inside actions. Client-side validation is a
 * convenience layer on top and is never the only check.
 */

const currencyEnum = z.enum(SUPPORTED_CURRENCIES);

/** A decimal string within a range. Rejects NaN, Infinity and empty by default. */
function decimalString(opts: {
  min?: string;
  max?: string;
  allowZero?: boolean;
  label: string;
}) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      ctx.addIssue({ code: "custom", message: `${opts.label} is required.` });
      return;
    }
    let parsed;
    try {
      parsed = toDecimal(value);
    } catch {
      ctx.addIssue({ code: "custom", message: `${opts.label} must be a number.` });
      return;
    }
    if (!opts.allowZero && parsed.isZero()) {
      ctx.addIssue({ code: "custom", message: `${opts.label} must be greater than zero.` });
    }
    if (opts.min !== undefined && parsed.lessThan(opts.min)) {
      ctx.addIssue({ code: "custom", message: `${opts.label} cannot be less than ${opts.min}.` });
    }
    if (opts.max !== undefined && parsed.greaterThan(opts.max)) {
      ctx.addIssue({ code: "custom", message: `${opts.label} cannot be more than ${opts.max}.` });
    }
    // Decimal(20, 2) tops out at 18 integer digits. Reject before Postgres does,
    // so the user gets a field error rather than a 500.
    if (parsed.abs().greaterThanOrEqualTo("1e18")) {
      ctx.addIssue({ code: "custom", message: `${opts.label} is too large.` });
    }
  });
}

const dateString = z
  .string()
  .trim()
  .refine((v) => {
    try {
      parseDateInput(v);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid date.");

// --- Auth -------------------------------------------------------------------

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.email("Enter a valid email address.").max(200),
  // 10 rather than 8: this app holds a user's income history and TIN.
  password: z.string().min(10, "Use at least 10 characters.").max(128, "Use 128 characters or fewer."),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address."),
});

const newPassword = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.");

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: newPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  })
  .refine((v) => v.password !== v.currentPassword, {
    message: "Choose a password different from your current one.",
    path: ["password"],
  });

// --- Client -----------------------------------------------------------------

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter a client name.").max(160),
  email: z.email("Enter a valid email address.").max(200),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  country: z.string().trim().min(2, "Choose a country.").max(2),
  currency: currencyEnum,
  addressLine: z.string().trim().max(400).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ClientFormValues = z.infer<typeof clientSchema>;

// --- Invoice ----------------------------------------------------------------

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Describe the work.").max(500),
  quantity: decimalString({ min: "0", label: "Quantity" }),
  unitPrice: decimalString({ min: "0", allowZero: true, label: "Rate" }),
});

export const invoiceSchema = z
  .object({
    clientId: z.string().min(1, "Choose a client."),
    issueDate: dateString,
    dueDate: dateString,
    currency: currencyEnum,
    // Stored as a fraction: 12% VAT is "0.12".
    taxRate: decimalString({ min: "0", max: "1", allowZero: true, label: "Tax rate" }),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    terms: z.string().trim().max(2000).optional().or(z.literal("")),
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item."),
  })
  .refine(
    (v) => parseDateInput(v.dueDate).getTime() >= parseDateInput(v.issueDate).getTime(),
    { message: "The due date cannot be before the issue date.", path: ["dueDate"] },
  );

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

// --- Payment ----------------------------------------------------------------

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  receivedAt: dateString,
  currency: currencyEnum,
  amountReceived: decimalString({ min: "0", label: "Amount received" }),
  feeAmount: decimalString({ min: "0", allowZero: true, label: "Fee" }),
  fxRate: decimalString({ min: "0", label: "Exchange rate" }),
  fxRateSource: z.string().trim().max(40).default("manual"),
  reference: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type PaymentFormValues = z.infer<typeof paymentSchema>;

// --- Settings ---------------------------------------------------------------

export const settingsSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  businessName: z.string().trim().max(160).optional().or(z.literal("")),
  // PH TIN is 9 or 12 digits, usually written 000-000-000-000.
  tin: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[\d-]{9,20}$/.test(v),
      "A TIN is 9 or 12 digits, e.g. 123-456-789-000.",
    ),
  addressLine: z.string().trim().max(400).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().min(2).max(2),
  defaultCurrency: currencyEnum,
  homeCurrency: currencyEnum,
  paymentDetails: z.string().trim().max(2000).optional().or(z.literal("")),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Enter a prefix.")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only."),
  invoiceNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;

// --- Helpers ----------------------------------------------------------------

/** Flatten a ZodError into `{ field: message }` for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    // Keep the first message per field; showing three at once is noise.
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
