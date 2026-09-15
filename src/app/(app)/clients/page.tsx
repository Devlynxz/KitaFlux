import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Users } from "lucide-react";

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
import { ListRow, ListRows } from "@/components/app/list-row";
import { Pagination } from "@/components/app/pagination";
import { parsePage } from "@/lib/pagination";
import { listClients } from "@/server/data/clients";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const includeArchived = params.archived === "1";
  const clients = await listClients(user.id, {
    search: params.q,
    includeArchived,
    page: parsePage(params.page),
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description="Who you bill, and in what currency."
        actions={
          <Link href="/clients/new" className={buttonVariants()}>
            <Plus /> New client
          </Link>
        }
      />

      {/* A GET form, so the search survives a refresh and can be shared. */}
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/clients">
        <Input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search name, company or email"
          aria-label="Search clients"
          className="max-w-xs"
        />
        {includeArchived ? <input type="hidden" name="archived" value="1" /> : null}
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <Link
          href={includeArchived ? "/clients" : "/clients?archived=1"}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </form>

      <Card>
        {clients.total === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={params.q ? "No clients match that search" : "No clients yet"}
            description={
              params.q
                ? "Try a different name, company or email address."
                : "Add the people and companies you invoice. Each one gets a default billing currency."
            }
            action={
              params.q ? (
                <Link href="/clients" className={buttonVariants({ variant: "secondary" })}>
                  Clear search
                </Link>
              ) : (
                <Link href="/clients/new" className={buttonVariants()}>
                  <Plus /> New client
                </Link>
              )
            }
          />
        ) : (
          <>
            <ListRows>
              {clients.items.map((c) => (
                <ListRow
                  key={c.id}
                  href={`/clients/${c.id}`}
                  title={
                    <>
                      <span className="truncate">{c.name}</span>
                      {c.archivedAt ? (
                        <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-normal text-[var(--color-ink-subtle)]">
                          Archived
                        </span>
                      ) : null}
                    </>
                  }
                  meta={
                    <span className="block truncate">
                      {c.company ? `${c.company} · ` : ""}
                      {c.email}
                    </span>
                  }
                  amount={c.currency}
                  amountMeta={`${c.invoiceCount} invoice${c.invoiceCount === 1 ? "" : "s"}`}
                />
              ))}
            </ListRows>
            <TableWrap className="max-sm:hidden">
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Country</Th>
                  <Th>Currency</Th>
                  <Th numeric>Invoices</Th>
                </tr>
              </thead>
              <tbody>
                {clients.items.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors last:[&>td]:border-b-0 hover:bg-[var(--color-surface-muted)]"
                  >
                    <Td>
                      <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.archivedAt ? (
                        <span className="ml-2 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-ink-subtle)]">
                          Archived
                        </span>
                      ) : null}
                      <div className="text-xs text-[var(--color-ink-subtle)]">
                        {c.company ? `${c.company} · ` : ""}
                        {c.email}
                      </div>
                    </Td>
                    <Td>{c.country}</Td>
                    <Td>
                      <span className="tabular text-xs font-medium">{c.currency}</span>
                    </Td>
                    <Td numeric>{c.invoiceCount}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={clients}
              basePath="/clients"
              params={{ q: params.q, archived: includeArchived ? "1" : undefined }}
              noun="clients"
            />
          </>
        )}
      </Card>
    </>
  );
}
