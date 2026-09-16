import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Pencil } from "lucide-react";

import { InvoiceActions } from "@/components/app/invoice-actions";
import { ListRow, ListRows } from "@/components/app/list-row";
import { Money } from "@/components/app/money";
import { PaymentForm } from "@/components/app/payment-form";
import { PaymentRowActions } from "@/components/app/payment-row-actions";
import { StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui/primitives";
import { formatDate, formatDateTime, relativeDueLabel } from "@/lib/dates";
import { isEditable } from "@/lib/invoice-status";
import { Decimal, formatMoney, toDecimal, toStorage } from "@/lib/money";
import { amountPaid, getInvoice } from "@/server/data/invoices";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const invoice = await getInvoice(user.id, id);
  if (!invoice) notFound();

  const cur = invoice.currency;
  const paid = amountPaid(invoice);
  const balance = toDecimal(invoice.total).minus(paid);
  const hasTax = !toDecimal(invoice.taxAmount).isZero();

  // Reading the key here rather than passing the key itself: the client
  // component only needs to know whether sending will actually email anyone.
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);

  const canTakePayment =
    invoice.status !== "DRAFT" && invoice.status !== "VOID" && balance.greaterThan(0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Invoices
      </Link>

      <PageHeader
        title={invoice.number ?? "Draft invoice"}
        description={`${invoice.client.name}${invoice.client.company ? ` · ${invoice.client.company}` : ""}`}
        actions={
          <>
            {isEditable(invoice.status) ? (
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className={buttonVariants({ variant: "secondary" })}
              >
                <Pencil /> Edit
              </Link>
            ) : null}
            <InvoiceActions
              invoiceId={invoice.id}
              status={invoice.status}
              clientEmail={invoice.client.email}
              emailConfigured={emailConfigured}
            />
          </>
        }
      />

      {/* Three columns from xl: at lg the two-thirds column is ~460px and the
          payments table (~570px of content) scrolled its Landed column away. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <StatusBadge status={invoice.status} />
            </CardHeader>
            <ListRows>
              {invoice.lineItems.map((l) => (
                <ListRow
                  key={l.id}
                  title={<span className="font-normal">{l.description}</span>}
                  meta={
                    <span className="tabular">
                      {toDecimal(l.quantity).toString()} × {formatMoney(l.unitPrice.toString(), cur)}
                    </span>
                  }
                  amount={formatMoney(l.amount.toString(), cur)}
                />
              ))}
            </ListRows>
            <TableWrap minWidth="26rem" className="max-sm:hidden">
              <thead>
                <tr>
                  <Th>Description</Th>
                  <Th numeric>Qty</Th>
                  <Th numeric>Rate</Th>
                  <Th numeric>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.description}</Td>
                    <Td numeric>{toDecimal(l.quantity).toString()}</Td>
                    <Td numeric>{formatMoney(l.unitPrice.toString(), cur)}</Td>
                    <Td numeric>{formatMoney(l.amount.toString(), cur)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <CardBody className="flex justify-end">
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-ink-muted)]">Subtotal</dt>
                  <dd className="tabular">{formatMoney(invoice.subtotal.toString(), cur)}</dd>
                </div>
                {hasTax ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-ink-muted)]">
                      Tax ({toDecimal(invoice.taxRate).times(100).toString()}%)
                    </dt>
                    <dd className="tabular">{formatMoney(invoice.taxAmount.toString(), cur)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">
                    {formatMoney(invoice.total.toString(), cur)} {cur}
                  </dd>
                </div>
                {paid.greaterThan(0) ? (
                  <>
                    <div className="flex justify-between text-[var(--color-success)]">
                      <dt>Paid</dt>
                      <dd className="tabular">{formatMoney(paid, cur)}</dd>
                    </div>
                    <div className="flex justify-between font-medium">
                      <dt>Balance</dt>
                      <dd className="tabular">{formatMoney(balance, cur)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          {invoice.notes || invoice.terms ? (
            <Card>
              <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
                {invoice.notes ? (
                  <div>
                    <p className="mb-1 text-xs text-[var(--color-ink-subtle)]">Notes</p>
                    <p className="whitespace-pre-line">{invoice.notes}</p>
                  </div>
                ) : null}
                {invoice.terms ? (
                  <div>
                    <p className="mb-1 text-xs text-[var(--color-ink-subtle)]">Terms</p>
                    <p className="whitespace-pre-line">{invoice.terms}</p>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            {invoice.payments.length === 0 ? (
              <CardBody>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Nothing received yet.
                </p>
              </CardBody>
            ) : (
              <>
                <ListRows>
                  {invoice.payments.map((p) => (
                    <ListRow
                      key={p.id}
                      title={<span>{formatDate(p.receivedAt)}</span>}
                      meta={
                        <span className="block">
                          {p.reference ? <span className="block truncate">{p.reference}</span> : null}
                          <span className="tabular">
                            {formatMoney(p.amountReceived.toString(), p.currency)}
                            {toDecimal(p.feeAmount).isZero()
                              ? ""
                              : ` − ${formatMoney(p.feeAmount.toString(), p.currency)} fee`}{" "}
                            at {toDecimal(p.fxRate).toDecimalPlaces(4).toString()}
                          </span>
                        </span>
                      }
                      amount={
                        <Money amount={toStorage(p.homeAmount, p.homeCurrency)} currency={p.homeCurrency} tint />
                      }
                      amountMeta={p.fxRateSource}
                      action={<PaymentRowActions paymentId={p.id} />}
                    />
                  ))}
                </ListRows>
                <TableWrap minWidth="36rem" className="max-sm:hidden">
                  <thead>
                    <tr>
                      <Th>Received</Th>
                      <Th numeric>Gross</Th>
                      <Th numeric>Fee</Th>
                      <Th numeric>Rate</Th>
                      <Th numeric>Landed</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((p) => (
                      <tr key={p.id} className="last:[&>td]:border-b-0">
                        <Td>
                          {formatDate(p.receivedAt)}
                          {p.reference ? (
                            <div className="text-xs text-[var(--color-ink-subtle)]">{p.reference}</div>
                          ) : null}
                        </Td>
                        <Td numeric>{formatMoney(p.amountReceived.toString(), p.currency)}</Td>
                        <Td numeric>{formatMoney(p.feeAmount.toString(), p.currency)}</Td>
                        <Td numeric>
                          {toDecimal(p.fxRate).toDecimalPlaces(4).toString()}
                          <div className="text-xs font-normal text-[var(--color-ink-subtle)]">
                            {p.fxRateSource}
                          </div>
                        </Td>
                        <Td numeric>
                          <Money amount={toStorage(p.homeAmount, p.homeCurrency)} currency={p.homeCurrency} tint />
                        </Td>
                        <Td>
                          <PaymentRowActions paymentId={p.id} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </>
            )}
          </Card>

          {canTakePayment ? (
            <PaymentForm
              invoiceId={invoice.id}
              invoiceCurrency={cur}
              homeCurrency={user.homeCurrency}
              balanceDue={toStorage(balance, cur)}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">Amount due</p>
                <p className="tabular mt-0.5 text-2xl font-semibold">
                  {formatMoney(balance.lessThan(0) ? new Decimal(0) : balance, cur)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">Issued</p>
                <p>{formatDate(invoice.issueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">Due</p>
                <p className={invoice.status === "OVERDUE" ? "text-[var(--color-danger)]" : undefined}>
                  {formatDate(invoice.dueDate)}
                  {invoice.status === "SENT" || invoice.status === "OVERDUE" ? (
                    <span className="block text-xs">{relativeDueLabel(invoice.dueDate)}</span>
                  ) : null}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">Client</p>
                <Link href={`/clients/${invoice.clientId}`} className="text-[var(--color-primary)] hover:underline">
                  {invoice.client.name}
                </Link>
                <p className="text-xs text-[var(--color-ink-subtle)]">{invoice.client.email}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-2.5 text-xs">
                <li className="flex justify-between gap-3">
                  <span className="text-[var(--color-ink-muted)]">Created</span>
                  <span>{formatDateTime(invoice.createdAt)}</span>
                </li>
                {invoice.sentAt ? (
                  <li className="flex justify-between gap-3">
                    <span className="text-[var(--color-ink-muted)]">Sent</span>
                    <span>{formatDateTime(invoice.sentAt)}</span>
                  </li>
                ) : null}
                {invoice.lastReminderAt ? (
                  <li className="flex justify-between gap-3">
                    <span className="text-[var(--color-ink-muted)]">
                      Reminder ×{invoice.reminderCount}
                    </span>
                    <span>{formatDateTime(invoice.lastReminderAt)}</span>
                  </li>
                ) : null}
                {invoice.paidAt ? (
                  <li className="flex justify-between gap-3">
                    <span className="text-[var(--color-ink-muted)]">Paid</span>
                    <span>{formatDateTime(invoice.paidAt)}</span>
                  </li>
                ) : null}
                {invoice.voidedAt ? (
                  <li className="flex justify-between gap-3">
                    <span className="text-[var(--color-ink-muted)]">Voided</span>
                    <span>{formatDateTime(invoice.voidedAt)}</span>
                  </li>
                ) : null}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
