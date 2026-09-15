import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { InvoiceForm } from "@/components/app/invoice-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { createInvoiceAction } from "@/server/actions/invoices";
import { listBillableClients } from "@/server/data/clients";
import { prisma } from "@/server/db";
import { peekNextInvoiceNumber } from "@/server/invoice-number";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const [clients, numberHint] = await Promise.all([
    listBillableClients(user.id),
    peekNextInvoiceNumber(prisma, user.id),
  ]);

  // Only honour a clientId that is actually in this user's list.
  const preselected = clients.some((c) => c.id === params.clientId)
    ? params.clientId
    : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Invoices
      </Link>

      <PageHeader
        title="New invoice"
        description="Saved as a draft. The number is assigned when you send it."
      />

      {clients.length === 0 ? (
        <Alert tone="warning" title="Add a client first">
          <p className="mb-3">An invoice needs someone to bill.</p>
          <Link href="/clients/new" className={buttonVariants({ size: "sm" })}>
            Add a client
          </Link>
        </Alert>
      ) : (
        <InvoiceForm
          action={createInvoiceAction}
          clients={clients}
          submitLabel="Save draft"
          numberHint={numberHint}
          defaults={{
            clientId: preselected,
            currency: preselected
              ? clients.find((c) => c.id === preselected)?.currency
              : user.defaultCurrency,
          }}
        />
      )}
    </div>
  );
}
