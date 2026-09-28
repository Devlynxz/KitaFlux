import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, FileText, Plus, TriangleAlert, Users, Wallet } from "lucide-react";

import { Money, Stat } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/primitives";
import { formatDate, relativeDueLabel } from "@/lib/dates";
import { Decimal, toDecimal } from "@/lib/money";
import { getDashboardSummary } from "@/server/data/dashboard";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Outstanding totals, one line per currency. Never summed across currencies.
 *
 * Never coloured by urgency: a stat is a summary, not an alarm. Overdue money
 * says so in its hint, which links to the list (see the design system's Stat).
 */
function CurrencyList({ totals }: { totals: Array<{ currency: string; amount: string }> }) {
  if (totals.length === 0) {
    return <span className="text-[var(--color-ink-subtle)]">—</span>;
  }
  return (
    <div className="space-y-0.5">
      {totals.map((t) => (
        <div key={t.currency}>
          <Money amount={t.amount} currency={t.currency} withCode={totals.length > 1} />
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const s = await getDashboardSummary(user.id, user.homeCurrency);

  const thisQ = toDecimal(s.receivedThisQuarter);
  const lastQ = toDecimal(s.receivedLastQuarter);
  const delta = lastQ.isZero()
    ? null
    : thisQ.minus(lastQ).dividedBy(lastQ).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  // First run: nothing exists yet, so point at the one useful next step rather
  // than showing five zeroed cards.
  if (!s.hasAnyClient && !s.hasAnyInvoice) {
    return (
      <>
        <PageHeader
          title={`Welcome, ${user.name.split(" ")[0] || "there"}`}
          description="Two steps to your first invoice."
        />
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="Add your first client"
            description="Once a client exists you can raise an invoice, send it as a PDF, and record what actually lands in your bank after fees and forex."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/clients/new" className={buttonVariants()}>
                  <Plus /> Add a client
                </Link>
                <Link href="/settings" className={buttonVariants({ variant: "secondary" })}>
                  Set up your business details
                </Link>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What you are owed, and what has actually landed."
        actions={
          <Link href="/invoices/new" className={buttonVariants()}>
            <Plus /> New invoice
          </Link>
        }
      />

        {/* One card, stats in a row, led by what actually landed in pesos. */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-x-6 gap-y-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label={`Received ${s.quarterLabel}`}
            hint={
              delta === null
                ? "Net of platform fees, at the rate on each payment date"
                : `${delta.isNegative() ? "" : "+"}${delta.toString()}% vs last quarter`
            }
          >
            <Money amount={s.receivedThisQuarter} currency={s.homeCurrency} tint />
          </Stat>

          <Stat label="Received last quarter" hint="For comparison">
            <span className="text-[var(--color-ink-muted)]">
              <Money amount={s.receivedLastQuarter} currency={s.homeCurrency} />
            </span>
          </Stat>

          <Stat
            label="Outstanding"
            hint={
              s.draftCount > 0
                ? `${s.draftCount} draft${s.draftCount === 1 ? "" : "s"} not yet sent`
                : "Sent and not yet paid"
            }
          >
            <CurrencyList totals={s.outstanding} />
          </Stat>

          <Stat
            label="Overdue"
            hint={
              s.overdueCount > 0 ? (
                <Link href="/invoices?status=OVERDUE" className="text-[var(--color-danger)] hover:underline">
                  {s.overdueCount} invoice{s.overdueCount === 1 ? "" : "s"} past due
                </Link>
              ) : (
                "Nothing past due"
              )
            }
          >
            <CurrencyList totals={s.overdue} />
          </Stat>
        </CardBody>
      </Card>

    {s.overdueCount > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger-ink)]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {s.overdueCount} invoice{s.overdueCount === 1 ? " is" : "s are"} past due. Reminders go
            out automatically once the scheduled job is running.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Due next</CardTitle>
            <Link
              href="/invoices"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              All invoices <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          {s.upcoming.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="Nothing outstanding"
              description="Every invoice you have sent has been paid."
            />
          ) : (
            <TableWrap minWidth="20rem">
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Due</Th>
                  <Th numeric>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {s.upcoming.map((inv) => (
                  <tr key={inv.id} className="last:[&>td]:border-b-0">
                    <Td>
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.number ?? "Draft"}
                      </Link>
                      <div className="text-xs text-[var(--color-ink-subtle)]">{inv.clientName}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <span
                          className={
                            inv.daysUntilDue < 0 ? "text-[var(--color-danger)]" : undefined
                          }
                        >
                          {relativeDueLabel(inv.dueDate)}
                        </span>
                        <StatusBadge status={inv.status} className="w-fit" />
                      </div>
                    </Td>
                    <Td numeric>
                      <Money amount={inv.total} currency={inv.currency} withCode />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
            <Link
              href="/payments"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              All payments <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          {s.recentPayments.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-5" />}
              title="No payments recorded yet"
              description="When a client pays, record the amount, the fee and the rate on the day it landed."
            />
          ) : (
            <TableWrap minWidth="20rem">
              <thead>
                <tr>
                  <Th>Received</Th>
                  <Th numeric>Amount</Th>
                  <Th numeric>Landed</Th>
                </tr>
              </thead>
              <tbody>
                {s.recentPayments.map((p) => (
                  <tr key={p.id} className="last:[&>td]:border-b-0">
                    <Td>
                      <Link href={`/invoices/${p.invoiceId}`} className="font-medium hover:underline">
                        {p.invoiceNumber ?? "Invoice"}
                      </Link>
                      <div className="text-xs text-[var(--color-ink-subtle)]">
                        {p.clientName} · {formatDate(p.receivedAt)}
                      </div>
                    </Td>
                    <Td numeric>
                      <Money amount={p.amountReceived} currency={p.currency} withCode />
                    </Td>
                    <Td numeric>
                      <Money amount={p.homeAmount} currency={p.homeCurrency} tint />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
