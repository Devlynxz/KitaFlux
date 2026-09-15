import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ClientForm } from "@/components/app/client-form";
import { PageHeader } from "@/components/ui/primitives";
import { createClientAction } from "@/server/actions/clients";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <PageHeader title="New client" description="Who are you billing?" />

      <ClientForm
        action={createClientAction}
        submitLabel="Add client"
        defaults={{ currency: user.defaultCurrency, country: "US" }}
      />
    </div>
  );
}
