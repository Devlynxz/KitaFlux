import { NextResponse } from "next/server";

import { getInvoice } from "@/server/data/invoices";
import { invoiceFilename, renderInvoicePdf } from "@/server/pdf/render";
import { getSessionUser } from "@/server/session";

// @react-pdf/renderer needs Node APIs; it does not run on the edge runtime.
export const runtime = "nodejs";
// The document changes whenever a payment is recorded, so it is never cached.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getSessionUser();
  // A route handler returns 401 rather than redirecting: this URL is opened in
  // a new tab and fetched directly, where a redirect to an HTML sign-in page
  // would download as a corrupt "PDF".
  if (!user) {
    return NextResponse.json({ error: "Sign in to download this invoice." }, { status: 401 });
  }

  const invoice = await getInvoice(user.id, id);
  if (!invoice) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const pdf = await renderInvoicePdf(invoice);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` so it previews in the browser tab; the filename still applies
      // when the user saves it.
      "Content-Disposition": `inline; filename="${invoiceFilename(invoice)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
