import Link from "next/link";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { ListRow, ListRows } from "@/components/app/list-row";
import { Money } from "@/components/app/money";
import { Pagination } from "@/components/app/pagination";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/primitives";
import { formatDate } from "@/lib/dates";
import { formatMoney, toDecimal } from "@/lib/money";
import { parsePage } from "@/lib/pagination";
import { listPayments, summarizePayments } from "@/server/data/payments";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const user = await requireUser();

  // Totals come from every payment, not from the page on screen. Home-currency
  // amounts are safe to sum: every row carries the rate it was actually
  // converted at. Source-currency amounts are not summed, for the same reason
  // the dashboard does not sum them.
  const [payments, summary] = await Promise.all([
    listPayments(user.id, { page: parsePage(page) }),
    summarizePayments(user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every amount that has actually landed, at the rate on the day it landed."
      />

      {summary.count > 0 ? (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardBody>
              <p className="text-xs font-medium text-[var(--color-ink-subtle)]">
                Total received ({user.homeCurrency})
              </p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                <Money amount={summary.homeTotal.toFixed(2)} currency={user.homeCurrency} tint />
              </p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Net of platform fees, across {summary.count} payment
                {summary.count === 1 ? "" : "s"}.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs font-medium text-[var(--color-ink-subtle)]">
                Lost to platform fees
              </p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--color-warning)]">
                {formatMoney(summary.feesHome, user.homeCurrency)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Converted at each payment&rsquo;s own rate.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Card>
        {payments.total === 0 ? (
          <EmptyState
            icon={<Wallet className="size-5" />}
            title="No payments recorded"
            description="Open a sent invoice and record what your client actually paid, including the platform fee and the rate on the day."
          />
        ) : (
          <>
            <ListRows>
              {payments.items.map((p) => {
                const hasFee = !toDecimal(p.feeAmount).isZero();
                return (
                  <ListRow
                    key={p.id}
                    href={`/invoices/${p.invoiceId}`}
                    title={<span className="truncate">{p.invoiceNumber ?? "Invoice"}</span>}
                    meta={
                      <span className="flex min-w-0 gap-1">
                        <span className="truncate">{p.clientName}</span>
                        <span className="shrink-0">· {formatDate(p.receivedAt)}</span>
                      </span>
                    }
                    amount={<Money amount={p.homeAmount} currency={p.homeCurrency} tint />}
                    amountMeta={
                      <>
                        <Money amount={p.amountReceived} currency={p.currency} />
                        {hasFee ? (
                          <>
                            {" "}
                            − <Money amount={p.feeAmount} currency={p.currency} />
                          </>
                        ) : null}
                      </>
                    }
                  />
                );
              })}
            </ListRows>

            <TableWrap className="max-sm:hidden">
              <thead>
                <tr>
                  <Th>Received</Th>
                  <Th>Invoice</Th>
                  <Th>Client</Th>
                  <Th numeric>Gross</Th>
                  <Th numeric>Fee</Th>
                  <Th numeric>Rate</Th>
                  <Th numeric>Landed</Th>
                </tr>
              </thead>
              <tbody>
                {payments.items.map((p) => (
                  <tr
                    key={p.id}
                    className="transition-colors last:[&>td]:border-b-0 hover:bg-[var(--color-surface-muted)]"
                  >
                    <Td>{formatDate(p.receivedAt)}</Td>
                    <Td>
                      <Link href={`/invoices/${p.invoiceId}`} className="font-medium hover:underline">
                        {p.invoiceNumber ?? "Invoice"}
                      </Link>
                      {p.reference ? (
                        <div className="text-xs text-[var(--color-ink-subtle)]">{p.reference}</div>
                      ) : null}
                    </Td>
                    <Td>{p.clientName}</Td>
                    <Td numeric>
                      <Money amount={p.amountReceived} currency={p.currency} withCode />
                    </Td>
                    <Td numeric>
                      <Money amount={p.feeAmount} currency={p.currency} />
                    </Td>
                    <Td numeric>
                      {toDecimal(p.fxRate).toDecimalPlaces(4).toString()}
                      <div className="text-xs font-normal text-[var(--color-ink-subtle)]">
                        {p.fxRateSource}
                      </div>
                    </Td>
                    <Td numeric>
                      <Money amount={p.homeAmount} currency={p.homeCurrency} tint />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <Pagination page={payments} basePath="/payments" noun="payments" />
          </>
        )}
      </Card>
    </>
  );
}
