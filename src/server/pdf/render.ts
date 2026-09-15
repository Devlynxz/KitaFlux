import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import type { FullInvoice } from "../data/invoices";
import { prisma } from "../db";
import { InvoiceDocument, type InvoiceIssuer } from "./invoice-document";

/**
 * Render an invoice to a PDF buffer.
 *
 * The issuer block is read here rather than passed in, so every caller (the
 * download route, the send action, the reminder job) produces an identical
 * document from the same source of truth.
 */
export async function renderInvoicePdf(invoice: FullInvoice): Promise<Buffer> {
  const user = await prisma.user.findUnique({
    where: { id: invoice.userId },
    select: {
      name: true,
      businessName: true,
      email: true,
      tin: true,
      addressLine: true,
      city: true,
      country: true,
      paymentDetails: true,
    },
  });

  const issuer: InvoiceIssuer = user ?? {
    name: "",
    businessName: null,
    email: "",
    tin: null,
    addressLine: null,
    city: null,
    country: "PH",
    paymentDetails: null,
  };

  return renderToBuffer(InvoiceDocument({ invoice, issuer }));
}

/** Filename a client should see when they save the attachment. */
export function invoiceFilename(invoice: { number: string | null; id: string }): string {
  return `${invoice.number ?? `draft-${invoice.id.slice(0, 8)}`}.pdf`;
}
