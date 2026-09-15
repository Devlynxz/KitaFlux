import { daysBetween, todayUtc } from "@/lib/dates";

import { prisma } from "../db";
import { getInvoice } from "../data/invoices";
import { sendOverdueReminderEmail } from "../email";
import { inngest } from "./client";

/**
 * Scheduled jobs.
 *
 * Two functions, deliberately separate:
 *
 *   sweepOverdueInvoices  - pure state reconciliation, no email. Cheap, safe to
 *                           re-run, and the thing the dashboard depends on.
 *   sendOverdueReminders  - the side-effecting one.
 *
 * Splitting them means a Resend outage cannot leave invoice statuses stale, and
 * the sweep can be re-run freely without spamming anyone.
 *
 * Both run daily at 01:00 UTC, which is 09:00 in Manila -- a reminder that
 * arrives during the client's working day gets read; one that arrives at 3am
 * gets buried.
 */

/** Reminders go out on this cadence after the due date, then stop. */
const REMINDER_DAYS = [1, 7, 14, 30];

/** Never send more than this many reminders for one invoice. */
const MAX_REMINDERS = REMINDER_DAYS.length;

export const sweepOverdueInvoices = inngest.createFunction(
  {
    id: "sweep-overdue-invoices",
    name: "Mark lapsed invoices overdue",
    triggers: [{ cron: "0 1 * * *" }],
  },
  async ({ step }) => {
    const swept = await step.run("sweep", async () => {
      const today = todayUtc();
      // Global, not per-user: there is no session here, and the query is scoped
      // by status and date rather than by owner. It only ever flips SENT to
      // OVERDUE, which cannot leak anything across users.
      const result = await prisma.invoice.updateMany({
        where: { status: "SENT", dueDate: { lt: today } },
        data: { status: "OVERDUE" },
      });
      return result.count;
    });

    return { swept };
  },
);

export const sendOverdueReminders = inngest.createFunction(
  {
    id: "send-overdue-reminders",
    name: "Email reminders for past-due invoices",
    // A low concurrency cap keeps this well inside Resend's rate limit without
    // needing a backoff loop.
    concurrency: { limit: 5 },
    triggers: [{ cron: "15 1 * * *" }],
  },
  async ({ step }) => {
    const candidates = await step.run("find-candidates", async () => {
      const today = todayUtc();

      const invoices = await prisma.invoice.findMany({
        where: {
          status: "OVERDUE",
          reminderCount: { lt: MAX_REMINDERS },
        },
        select: {
          id: true,
          userId: true,
          dueDate: true,
          reminderCount: true,
          lastReminderAt: true,
        },
      });

      return invoices
        .filter((inv) => {
          const overdueDays = daysBetween(inv.dueDate, today);
          const nextThreshold = REMINDER_DAYS[inv.reminderCount];
          if (nextThreshold === undefined) return false;
          if (overdueDays < nextThreshold) return false;

          // Guard against two runs in one day double-sending.
          if (inv.lastReminderAt) {
            const sinceLast = daysBetween(inv.lastReminderAt, today);
            if (sinceLast < 1) return false;
          }
          return true;
        })
        .map((inv) => ({ id: inv.id, userId: inv.userId }));
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const outcome = await step.run(`remind-${candidate.id}`, async () => {
        const invoice = await getInvoice(candidate.userId, candidate.id);
        if (!invoice) return "skipped";

        // Re-check inside the step: a payment may have arrived between the
        // candidate query and now.
        if (invoice.status !== "OVERDUE") return "skipped";

        const result = await sendOverdueReminderEmail(invoice);
        if (result.status !== "sent") {
          return result.status === "skipped" ? "skipped" : "failed";
        }

        // Only counted once the email actually went, so a failure retries
        // tomorrow rather than silently burning a slot in the ladder.
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
        });
        return "sent";
      });

      if (outcome === "sent") sent += 1;
      else if (outcome === "failed") failed += 1;
      else skipped += 1;
    }

    return { candidates: candidates.length, sent, failed, skipped };
  },
);

export const functions = [sweepOverdueInvoices, sendOverdueReminders];
