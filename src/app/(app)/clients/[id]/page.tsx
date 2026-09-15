import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText, Pencil, Plus } from "lucide-react";

import { ClientRowActions } from "@/components/app/client-row-actions";
import { ListRow, ListRows } from "@/components/app/list-row";
import { Money } from "@/components/app/money";
import { Pagination } from "@/components/app/pagination";
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
import { countryName } from "@/lib/countries";
import { formatDate } from "@/lib/dates";
import { parsePage } from "@/lib/pagination";
import { getClient } from "@/server/data/clients";
import { listInvoices } from "@/server/data/invoices";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Client" };

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const user = await requireUser();

  const client = await getClient(user.id, id);
  // getClient is already scoped to userId, so a miss means either "does not
  // exist" or "not yours" -- both are a 404, which is what you want: a 403
  // would confirm the id belongs to someone.
  if (!client) notFound();

  const invoices = await listInvoices(user.id, { clientId: id, page: parsePage(page) });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <PageHeader
        title={client.name}
        description={client.company ?? undefined}
        actions={
          <>
            <Link href={`/invoices/new?clientId=${client.id}`} className={buttonVariants()}>
              <Plus /> New invoice
            </Link>
            <Link
              href={`/clients/${client.id}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Pencil /> Edit
            </Link>
            <ClientRowActions
              clientId={client.id}
              archived={Boolean(client.archivedAt)}
              invoiceCount={invoices.total}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-[var(--color-ink-subtle)]">Email</p>
              <a href={`mailto:${client.email}`} className="text-[var(--color-primary)] hover:underline">
                {client.email}
              </a>
            </div>
            <div>
              <p className="text-xs text-[var(--color-ink-subtle)]">Country</p>
              <p>{countryName(client.country)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-ink-subtle)]">Billing currency</p>
              <p className="tabular font-medium">{client.currency}</p>
            </div>
            {client.addressLine ? (
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">Address</p>
                <p className="whitespace-pre-line">{client.addressLine}</p>
              </div>
            ) : null}
            {client.notes ? (
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">Internal notes</p>
                <p className="whitespace-pre-line text-[var(--color-ink-muted)]">{client.notes}</p>
              </div>
            ) : null}
            {client.archivedAt ? (
              <p className="rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-muted)]">
                Archived on {formatDate(client.archivedAt)}. Existing invoices are unaffected; this
                client just will not appear when raising a new one.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          {invoices.total === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No invoices yet"
              description={`Raise the first invoice for ${client.name}.`}
              action={
                <Link href={`/invoices/new?clientId=${client.id}`} className={buttonVariants()}>
                  <Plus /> New invoice
                </Link>
              }
            />
          ) : (
            <>
              <ListRows>
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
                        <span className="text-[var(--color-ink-subtle)]">Draft</span>
                      )
                    }
                    meta={`Issued ${formatDate(inv.issueDate)}`}
                    amount={<Money amount={inv.total} currency={inv.currency} />}
                    amountMeta={inv.currency}
                  />
                ))}
              </ListRows>
              <TableWrap minWidth="26rem" className="max-sm:hidden">
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Issued</Th>
                    <Th>Status</Th>
                    <Th numeric>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.items.map((inv) => (
                    <tr key={inv.id} className="last:[&>td]:border-b-0">
                      <Td>
                        <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                          {inv.number ?? "Draft"}
                        </Link>
                      </Td>
                      <Td>{formatDate(inv.issueDate)}</Td>
                      <Td>
                        <StatusBadge status={inv.status} />
                      </Td>
                      <Td numeric>
                        <Money amount={inv.total} currency={inv.currency} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              <Pagination page={invoices} basePath={`/clients/${client.id}`} noun="invoices" />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
