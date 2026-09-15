import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { fieldErrors } from "@/lib/validation";

import { UnauthorizedError } from "../session";

/**
 * The shape every server action returns.
 *
 * A discriminated union rather than throwing: a form submission that fails
 * validation is an ordinary outcome, not an exception, and it needs to come
 * back to the client as data so the fields can render their own errors.
 */
export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; message: string; errors?: Record<string, string> };

export const idle: ActionState = { ok: true };

/**
 * Turn an unexpected throw into a message a user can act on.
 *
 * Domain errors (InvalidTransitionError, FxError, PaymentTargetError) already
 * carry a sentence written for a human, so those are surfaced as-is. Anything
 * else is logged and replaced with a generic line -- a raw Postgres error string
 * in the UI leaks schema detail and helps nobody.
 */
const SAFE_ERRORS = new Set([
  "InvalidTransitionError",
  "FxError",
  "FxUnavailableError",
  "PaymentTargetError",
  "InvoiceNotFoundError",
  "InvoiceLockedError",
  "ClientNotFoundError",
]);

export function toActionState(error: unknown): ActionState {
  if (error instanceof UnauthorizedError) {
    return { ok: false, message: error.message };
  }

  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      errors: fieldErrors(error),
    };
  }

  if (error instanceof Error && SAFE_ERRORS.has(error.name)) {
    return { ok: false, message: error.message };
  }

  // The action returns a friendly message instead of throwing, which also means
  // Next.js never sees the failure -- so this is the one place a server action
  // bug gets reported. Expected outcomes (validation, domain errors, auth) have
  // already returned above and are deliberately not reported.
  Sentry.captureException(error);
  console.error("[kitaflux] unhandled action error", error);
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** Read a text field out of FormData, trimmed, as a string. */
export function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Rebuild the repeating line-item rows out of FormData.
 *
 * The form posts `lineItems[0].description` style keys; indices are collected
 * and sorted numerically so a row deleted client-side (leaving a gap in the
 * indices) still produces a dense, correctly ordered array.
 */
export function lineItemsFromForm(form: FormData) {
  const indices = new Set<number>();
  for (const key of form.keys()) {
    const match = /^lineItems\[(\d+)\]/.exec(key);
    if (match) indices.add(Number(match[1]));
  }

  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => ({
      description: field(form, `lineItems[${i}].description`),
      quantity: field(form, `lineItems[${i}].quantity`),
      unitPrice: field(form, `lineItems[${i}].unitPrice`),
    }))
    // A trailing blank row is what an empty "add another line" leaves behind.
    // Dropping it here is kinder than making the user delete it.
    .filter((l) => l.description !== "" || l.quantity !== "" || l.unitPrice !== "");
}
