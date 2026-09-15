import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ClientForm } from "@/components/app/client-form";
import { PageHeader } from "@/components/ui/primitives";
import { updateClientAction } from "@/server/actions/clients";
import { getClient } from "@/server/data/clients";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const client = await getClient(user.id, id);
  if (!client) notFound();

  // Bind the id server-side. The client component only ever receives a
  // pre-scoped action, so a tampered form field cannot retarget the update.
  const action = updateClientAction.bind(null, client.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/clients/${client.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> {client.name}
      </Link>

      <PageHeader title="Edit client" />

      <ClientForm
        action={action}
        submitLabel="Save changes"
        defaults={{
          name: client.name,
          email: client.email,
          company: client.company,
          country: client.country,
          currency: client.currency,
          addressLine: client.addressLine,
          notes: client.notes,
        }}
      />
    </div>
  );
}
