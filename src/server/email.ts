import "server-only";

import { Resend } from "resend";

import { formatDate, relativeDueLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import type { FullInvoice } from "./data/invoices";
import { prisma } from "./db";
import { renderInvoicePdf } from "./pdf/render";

/**
 * Outbound email.
 *
 * Every send returns a result rather than throwing. Email is the one part of
 * this app that depends on a third party being up, and a Resend outage must
 * never roll back an invoice that was legitimately marked sent -- callers
 * report the delivery failure and let the user download the PDF instead.
 *
 * With no RESEND_API_KEY the app runs normally and every send is "skipped",
 * which is what makes local development possible with no credentials at all.
 */

export type DeliveryResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "KitaFlux <onboarding@resend.dev>";
}

/**
 * In development, EMAIL_DEV_REDIRECT_TO sends everything to one inbox. Without
 * it, testing the reminder job would email real clients.
 */
function recipient(intended: string): string {
  return process.env.EMAIL_DEV_REDIRECT_TO || intended;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Shared shell so both emails look like the same product.
 *
 * The header image is referenced by absolute URL -- an email client has no
 * origin to resolve a relative path against. When NEXT_PUBLIC_APP_URL is not
 * set (local development), the image is omitted rather than left broken, and
 * the text wordmark carries the branding on its own.
 */
function layout(body: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  const header = appUrl
    ? `<img src="${appUrl}/brand/email-header.png" alt="KitaFlux" width="180" height="60"
           style="display:block;border:0;outline:none;text-decoration:none">`
    : `<span style="font-size:17px;font-weight:700;letter-spacing:-0.02em">Kita<span style="color:#0558e0">Flux</span></span>`;

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f8fd;font-family:'IBM Plex Sans',Arial,Helvetica,sans-serif;color:#0a1733">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
    <tr><td style="padding-bottom:20px">
      ${header}
    </td></tr>
    <tr><td style="height:3px;line-height:3px;font-size:0;border-radius:3px;background:#0385fd;background-image:linear-gradient(90deg,#0444c6 0%,#0385fd 36%,#04c0fd 64%,#19df93 100%)">&nbsp;</td></tr>
    <tr><td style="background:#ffffff;border:1px solid #dae2f0;border-top:0;border-radius:0 0 16px 16px;padding:28px">
      ${body}
    </td></tr>
    <tr><td style="padding-top:16px;font-size:12px;color:#5c6984">
      Sent with KitaFlux — global income, clear local numbers.
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Who the client is hearing from, and where their reply should go.
 *
 * Read from the user row rather than from the invoice: `getInvoice` does not
 * join the user, and the invoice must not be the thing that decides whose name
 * signs the email. `replyTo` matters as much as the name -- the reminder tells
 * the client to "just reply here", and without it that reply lands in the
 * shared sending address instead of with the freelancer.
 */
async function sender(userId: string): Promise<{ name: string; replyTo: string | undefined }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, businessName: true, email: true },
  });
  return {
    name: user?.businessName || user?.name || "Your contractor",
    replyTo: user?.email || undefined,
  };
}

export async function sendInvoiceEmail(invoice: FullInvoice): Promise<DeliveryResult> {
  const resend = client();
  if (!resend) return { status: "skipped", reason: "RESEND_API_KEY is not set" };

  try {
    const [pdf, from] = await Promise.all([renderInvoicePdf(invoice), sender(invoice.userId)]);
    const number = invoice.number ?? "draft";
    const total = formatMoney(invoice.total.toString(), invoice.currency, { withCode: true });

    const body = `
      <p style="margin:0 0 16px;font-size:15px">Hi ${escapeHtml(invoice.client.name)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
        Invoice <strong>${escapeHtml(number)}</strong> is attached, for <strong>${escapeHtml(total)}</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#43506b">Issued</td><td style="padding:6px 0;text-align:right">${formatDate(invoice.issueDate)}</td></tr>
        <tr><td style="padding:6px 0;color:#43506b">Due</td><td style="padding:6px 0;text-align:right"><strong>${formatDate(invoice.dueDate)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#43506b">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(total)}</td></tr>
      </table>
      ${invoice.notes ? `<p style="margin:20px 0 0;font-size:14px;color:#43506b;line-height:1.55">${escapeHtml(invoice.notes)}</p>` : ""}
      <p style="margin:24px 0 0;font-size:14px">Thank you,<br>${escapeHtml(from.name)}</p>`;

    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: recipient(invoice.client.email),
      replyTo: from.replyTo,
      subject: `Invoice ${number} — ${total}`,
      html: layout(body),
      attachments: [{ filename: `${number}.pdf`, content: pdf.toString("base64") }],
    });

    if (error) return { status: "failed", error: error.message };
    return { status: "sent", id: data?.id ?? "" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function sendOverdueReminderEmail(invoice: FullInvoice): Promise<DeliveryResult> {
  const resend = client();
  if (!resend) return { status: "skipped", reason: "RESEND_API_KEY is not set" };

  try {
    const from = await sender(invoice.userId);
    const number = invoice.number ?? "";
    const total = formatMoney(invoice.total.toString(), invoice.currency, { withCode: true });
    const overdue = relativeDueLabel(invoice.dueDate);

    // Deliberately plain and non-accusatory. A reminder that reads as a threat
    // costs a freelancer the client; the useful part is the payment detail.
    const body = `
      <p style="margin:0 0 16px;font-size:15px">Hi ${escapeHtml(invoice.client.name)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
        A quick reminder that invoice <strong>${escapeHtml(number)}</strong> for
        <strong>${escapeHtml(total)}</strong> was due on ${formatDate(invoice.dueDate)} — ${escapeHtml(overdue.toLowerCase())}.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
        If it is already on its way, please ignore this. If anything is unclear about the invoice, just reply here.
      </p>
      <p style="margin:24px 0 0;font-size:14px">Thank you,<br>${escapeHtml(from.name)}</p>`;

    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: recipient(invoice.client.email),
      replyTo: from.replyTo,
      subject: `Reminder: invoice ${number} is past due`,
      html: layout(body),
    });

    if (error) return { status: "failed", error: error.message };
    return { status: "sent", id: data?.id ?? "" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Password reset link.
 *
 * Without Resend there is no way to deliver it. In development the link is
 * written to the server log so the flow can still be exercised end to end; in
 * production it is never logged, because the URL is a credential -- anyone who
 * can read the log could take over the account.
 */
export async function sendPasswordResetEmail(to: string, url: string): Promise<DeliveryResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[kitaflux] email not configured; password reset link for ${to}: ${url}`);
    } else {
      console.warn("[kitaflux] password reset requested but RESEND_API_KEY is not set");
    }
    return { status: "skipped", reason: "RESEND_API_KEY is not set" };
  }

  try {
    const body = `
      <p style="margin:0 0 16px;font-size:15px">Hi,</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
        Someone asked to reset the password for your KitaFlux account. The link below works once and expires in one hour.
      </p>
      <p style="margin:0 0 24px">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#0558e0;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Choose a new password</a>
      </p>
      <p style="margin:0;font-size:13px;color:#5c6984;line-height:1.55">
        If you did not ask for this, you can ignore this email — your password stays the same.
      </p>`;

    // Deliberately not redirected by EMAIL_DEV_REDIRECT_TO: this goes to the
    // account holder, never to a client.
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: "Reset your KitaFlux password",
      html: layout(body),
    });

    if (error) return { status: "failed", error: error.message };
    return { status: "sent", id: data?.id ?? "" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
  }
}
