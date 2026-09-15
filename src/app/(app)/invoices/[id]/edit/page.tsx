import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { InvoiceForm } from "@/components/app/invoice-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { toDateInputValue } from "@/lib/dates";
import { isEditable } from "@/lib/invoice-status";
import { toDecimal } from "@/lib/money";
import { updateInvoiceAction } from "@/server/actions/invoices";
import { listBillableClients } from "@/server/data/clients";
import { getInvoice } from "@/server/data/invoices";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const invoice = await getInvoice(user.id, id);
  if (!invoice) notFound();

  const clients = await listBillableClients(user.id);

  // Editing is refused server-side too (updateInvoice throws on a non-draft).
  // This is the friendly half of the same rule.
  if (!isEditable(invoice.status)) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/invoices/${invoice.id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" /> {invoice.number ?? "Invoice"}
        </Link>
        <Alert tone="warning" title="This invoice can no longer be edited">
          It is {invoice.status.toLowerCase()}, so the client already has these figures. Void it and
          raise a new one if something is wrong.
        </Alert>
      </div>
    );
  }

  // The archived client attached to a draft still has to appear in the select,
  // or saving would silently reassign the invoice to a different client.
  const options = clients.some((c) => c.id === invoice.clientId)
    ? clients
    : [
        {
          id: invoice.client.id,
          name: invoice.client.name,
          email: invoice.client.email,
          company: invoice.client.company,
          currency: invoice.client.currency,
        },
        ...clients,
      ];

  const action = updateInvoiceAction.bind(null, invoice.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/invoices/${invoice.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to invoice
      </Link>

      <PageHeader title="Edit draft" />

      <InvoiceForm
        action={action}
        clients={options}
        submitLabel="Save draft"
        defaults={{
          clientId: invoice.clientId,
          issueDate: toDateInputValue(invoice.issueDate),
          dueDate: toDateInputValue(invoice.dueDate),
          currency: invoice.currency,
          taxRate: toDecimal(invoice.taxRate).toString(),
          notes: invoice.notes,
          terms: invoice.terms,
          lineItems: invoice.lineItems.map((l) => ({
            description: l.description,
            quantity: toDecimal(l.quantity).toString(),
            unitPrice: toDecimal(l.unitPrice).toFixed(2),
          })),
        }}
      />
    </div>
  );
}
