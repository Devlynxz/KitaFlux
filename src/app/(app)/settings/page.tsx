import type { Metadata } from "next";

import { AccountDataSettings } from "@/components/app/account-data-settings";
import { SecuritySettings } from "@/components/app/security-settings";
import { SettingsForm } from "@/components/app/settings-form";
import { PageHeader } from "@/components/ui/primitives";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  // The counter is shown read-only so the user can see where their numbering
  // is up to without being able to change it.
  const counter = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      invoiceSeq: true,
      // Shown in the delete warning, so "this deletes 58 invoices" is concrete.
      _count: { select: { clients: true, invoices: true, payments: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="These details appear on your invoices and drive your peso reporting."
      />

      <SettingsForm
        defaults={{
          name: user.name,
          businessName: user.businessName,
          tin: user.tin,
          addressLine: user.addressLine,
          city: user.city,
          country: user.country,
          defaultCurrency: user.defaultCurrency,
          homeCurrency: user.homeCurrency,
          paymentDetails: user.paymentDetails,
          invoicePrefix: user.invoicePrefix,
          invoiceNotes: user.invoiceNotes,
        }}
        email={user.email}
        issuedCount={counter?.invoiceSeq ?? 0}
      />

      <SecuritySettings />

      <AccountDataSettings
        email={user.email}
        counts={counter?._count ?? { clients: 0, invoices: 0, payments: 0 }}
      />
    </div>
  );
}
