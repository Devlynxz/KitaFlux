import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock3, FileText, Receipt, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/server/session";

/**
 * Landing page.
 *
 * The pitch is the specific, unglamorous problem: a spreadsheet cannot tell you
 * what an invoice was actually worth in pesos, because the answer depends on
 * the rate on a date in the past. Everything on this page serves that one idea.
 */

const FEATURES = [
  {
    icon: FileText,
    title: "Invoice in USD, PDF included",
    body: "Line items, your TIN and payment details, a sequential number that never has a gap. Emailed to the client with the PDF attached.",
  },
  {
    icon: Receipt,
    title: "Record what actually landed",
    body: "Gross received, the platform fee, and the peso amount at the rate on the day the money arrived — not today's rate.",
  },
  {
    icon: Clock3,
    title: "Reminders that send themselves",
    body: "Past-due invoices chase themselves, politely, so you are not the one writing that email on a Sunday.",
  },
  {
    icon: ShieldCheck,
    title: "Quarter-ready records",
    body: "Gross pesos and a per-client breakdown for the quarter, exportable as a CSV you can hand to your accountant.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-[var(--color-canvas)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonVariants()}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-grid relative border-b">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <div className="max-w-2xl">
              <p className="inline-flex items-center rounded-full border bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-ink-muted)]">
                For Filipino freelancers billing international clients
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Global income.
                <br />
                <span className="text-[var(--color-primary)]">Clear local numbers.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)] sm:text-lg">
                Invoice in dollars. Record what actually reached your bank in pesos, after platform
                fees and at the rate on the day it landed. Keep records that still make sense at
                filing time.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/sign-up" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
                  Start tracking <ArrowRight />
                </Link>
                <Link href="/sign-in" className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full sm:w-auto" })}>
                  I already have an account
                </Link>
              </div>
            </div>

            {/* The core idea, as the numbers themselves. */}
            <div className="card mt-14 max-w-2xl overflow-hidden">
              <div className="border-b px-5 py-3">
                <p className="text-xs font-medium text-[var(--color-ink-subtle)]">
                  One payment, three different numbers
                </p>
              </div>
              <dl className="divide-y">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <dt className="text-sm text-[var(--color-ink-muted)]">You invoiced</dt>
                  <dd className="tabular text-base font-semibold">$1,200.00</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <dt className="text-sm text-[var(--color-ink-muted)]">
                    Wise sent, after a $14.40 fee
                  </dt>
                  <dd className="tabular text-base font-semibold">$1,185.60</dd>
                </div>
                <div className="flex items-center justify-between bg-[var(--color-surface-muted)] px-5 py-3.5">
                  <dt className="text-sm font-medium">
                    Landed in your bank
                    <span className="ml-1.5 text-xs font-normal text-[var(--color-ink-subtle)]">
                      at 57.85 on 5 Mar
                    </span>
                  </dt>
                  <dd className="tabular text-lg font-semibold text-[var(--color-php)]">
                    ₱68,586.96
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">
            The parts a spreadsheet gets wrong
          </h2>
          <p className="mt-2 max-w-2xl text-[var(--color-ink-muted)]">
            A spreadsheet can hold the numbers. It cannot tell you what an invoice was worth in
            pesos on a date in the past, and it will quietly recalculate that answer every time you
            open it.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-6">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand-600)]/10 text-[var(--color-primary)]">
                  <Icon className="size-4.5" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-[var(--color-surface)]">
          <div className="mx-auto max-w-6xl px-5 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Stop guessing what you earned
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-[var(--color-ink-muted)]">
              Set it up in a few minutes. Your first invoice can go out today.
            </p>
            <Link href="/sign-up" className={buttonVariants({ size: "lg", className: "mt-7" })}>
              Create your account <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-[var(--color-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>
            KitaFlux keeps your records. It does not file taxes for you and is not tax advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
