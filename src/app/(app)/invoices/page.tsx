import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Plus } from "lucide-react";

import { ListRow, ListRows } from "@/components/app/list-row";
import { Money } from "@/components/app/money";
import { Pagination } from "@/components/app/pagination";
import { StatusBadge } from "@/components/app/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  Input,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/primitives";
import { formatDate, relativeDueLabel } from "@/lib/dates";
import { INVOICE_STATUSES, type Status } from "@/lib/invoice-status";
import { cn } from "@/lib/cn";
import { parsePage } from "@/lib/pagination";
import { listInvoices, sweepOverdue } from "@/server/data/invoices";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Invoices" };

const FILTERS: Array<{ label: string; value: string }> = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Sent", value: "SENT" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Paid", value: "PAID" },
  { label: "Void", value: "VOID" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  // Reconcile lapsed invoices before listing, so the filter chips and the rows
  // agree with each other.
  await sweepOverdue(user.id);

  const status =
    params.status && (INVOICE_STATUSES as readonly string[]).includes(params.status)
      ? [params.status as Status]
      : undefined;

  const invoices = await listInvoices(user.id, {
    status,
    search: params.q,
    page: parsePage(params.page),
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Everything you have billed, and where it stands."
        actions={
          <Link href="/invoices/new" className={buttonVariants()}>
            <Plus /> New invoice
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const active = (params.status ?? "") === f.value;
            const href = f.value ? `/invoices?status=${f.value}` : "/invoices";
            return (
              <Link
                key={f.label}
                href={href}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                    : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border hover:bg-[var(--color-surface-muted)]",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto" action="/invoices">
          {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Invoice number or client"
            aria-label="Search invoices"
            className="min-w-0 flex-1 sm:w-52 sm:flex-none"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      <Card>
        {invoices.total === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title={
              params.q || params.status ? "Nothing matches that filter" : "No invoices yet"
            }
            description={
              params.q || params.status
                ? "Try a different status or search term."
                : "Create an invoice, send it as a PDF, then record what actually lands in your bank."
            }
            action={
              params.q || params.status ? (
                <Link href="/invoices" className={buttonVariants({ variant: "secondary" })}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/invoices/new" className={buttonVariants()}>
                  <Plus /> New invoice
                </Link>
              )
            }
          />
        ) : (
          <>
            <ListRows breakpoint="md">
              {invoices.items.map((inv) => (
                <ListRow
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  title={
                    inv.number ? (
                      <>
                        <span className="truncate">{inv.number}</span>
                        <StatusBadge status={inv.status} />
                      </>
                    ) : (
                      // An unnumbered row is a draft; a "Draft" badge beside
                      // the word "Draft" would say it twice.
                      <span className="text-[var(--color-ink-subtle)]">Draft</span>
                    )
                  }
                  meta={
                    // The client name gives way first: the due date is the
                    // part someone checking on their phone is looking for.
                    <span className="flex min-w-0 gap-1">
                      <span className="truncate">{inv.clientName}</span>
                      <span
                        className={cn(
                          "shrink-0",
                          inv.status === "OVERDUE" && "text-[var(--color-danger)]",
                        )}
                      >
                        ·{" "}
                        {inv.status === "SENT" || inv.status === "OVERDUE"
                          ? relativeDueLabel(inv.dueDate)
                          : formatDate(inv.issueDate)}
                      </span>
                    </span>
                  }
                  amount={<Money amount={inv.total} currency={inv.currency} />}
                  amountMeta={inv.currency}
                />
              ))}
            </ListRows>
            <TableWrap className="max-md:hidden">
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Client</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th numeric>Total</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.items.map((inv) => (
                  <tr
                    key={inv.id}
                    className="transition-colors last:[&>td]:border-b-0 hover:bg-[var(--color-surface-muted)]"
                  >
                    <Td className="whitespace-nowrap">
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.number ?? (
                          <span className="text-[var(--color-ink-subtle)]">Draft</span>
                        )}
                      </Link>
                    </Td>
                    <Td>
                      <Link
                        href={`/clients/${inv.clientId}`}
                        className="hover:underline"
                      >
                        {inv.clientName}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(inv.issueDate)}</Td>
                    <Td className="whitespace-nowrap">
                      <span
                        className={
                          inv.status === "OVERDUE" ? "text-[var(--color-danger)]" : undefined
                        }
                      >
                        {/* Only an invoice the client has can be late. A draft
                            past its due date is a stale draft, not a debt. */}
                        {inv.status === "SENT" || inv.status === "OVERDUE"
                          ? relativeDueLabel(inv.dueDate)
                          : formatDate(inv.dueDate)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={inv.status} />
                    </Td>
                    <Td numeric>
                      <Money amount={inv.total} currency={inv.currency} withCode />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={invoices}
              basePath="/invoices"
              params={{ status: params.status, q: params.q }}
              noun="invoices"
            />
          </>
        )}
      </Card>
    </>
  );
}
