import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatDate } from "@/lib/dates";
import { formatMoney, toDecimal } from "@/lib/money";

import type { FullInvoice } from "../data/invoices";
import { LOGO_PNG_DATA_URI } from "./logo-data";

/**
 * The invoice PDF.
 *
 * Document-first and deliberately not a screenshot of the web UI: the product
 * mark, black text, hairline rules, and figures in a tabular column. Everything
 * except the mark is greyscale, which matters because clients forward invoices
 * to accounts departments that print them.
 *
 * The mark is the full-colour product logo rather than a print-safe monochrome
 * variant. That is a deliberate call: one brand across every surface was chosen
 * over greyscale fidelity, and the surrounding document carries no other colour,
 * so a desaturated mark still reads cleanly.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#0F172A",
    lineHeight: 1.5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 36,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  // The real product mark, inlined as a data URI so the render never depends on
  // the filesystem or the network. See ./logo-data.ts.
  mark: { width: 42, height: 42, marginRight: 10 },
  // Helvetica rather than Plus Jakarta Sans: registering a webfont means a
  // network fetch at render time inside a serverless function, and that is not
  // a risk worth taking on the one document a client actually receives.
  wordmark: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },

  // lineHeight 1 overrides the page's 1.5. At 20pt the inherited leading pushes
  // the title's box down onto the number underneath it, and the two collide.
  invoiceTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
    textAlign: "right",
    lineHeight: 1,
  },
  invoiceNumber: {
    fontSize: 10,
    color: "#475569",
    textAlign: "right",
    lineHeight: 1,
    marginTop: 6,
  },

  partiesRow: { flexDirection: "row", gap: 32, marginBottom: 28 },
  party: { flex: 1 },
  partyLabel: {
    fontSize: 7.5,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 2 },
  partyLine: { color: "#475569" },

  metaRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 10,
    marginBottom: 24,
  },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 7.5, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6 },
  metaValue: { fontFamily: "Helvetica-Bold", marginTop: 2 },

  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#0F172A",
    paddingBottom: 6,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#E2E8F0",
    paddingVertical: 7,
  },
  colDesc: { flex: 1, paddingRight: 12 },
  colQty: { width: 58, textAlign: "right" },
  colRate: { width: 78, textAlign: "right" },
  colAmount: { width: 88, textAlign: "right" },
  headCell: { fontSize: 7.5, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6 },

  totalsWrap: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end" },
  totals: { width: 224 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { color: "#475569" },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#0F172A",
    marginTop: 6,
    paddingTop: 8,
  },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 13 },

  paidNote: { marginTop: 6, textAlign: "right", color: "#16A34A", fontSize: 9 },
  balanceNote: { marginTop: 2, textAlign: "right", color: "#475569", fontSize: 9 },

  block: { marginTop: 26 },
  blockLabel: {
    fontSize: 7.5,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  blockBody: { color: "#334155" },

  voidStamp: {
    position: "absolute",
    top: 300,
    left: 120,
    fontSize: 72,
    fontFamily: "Helvetica-Bold",
    color: "#DC2626",
    opacity: 0.14,
    transform: "rotate(-24deg)",
  },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderColor: "#E2E8F0",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#64748B",
  },
});

export interface InvoiceIssuer {
  name: string;
  businessName: string | null;
  email: string;
  tin: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  paymentDetails: string | null;
}

export function InvoiceDocument({
  invoice,
  issuer,
}: {
  invoice: FullInvoice;
  issuer: InvoiceIssuer;
}) {
  const cur = invoice.currency;
  const money = (v: unknown) => formatMoney(String(v), cur);

  const paid = invoice.payments.reduce(
    (acc, p) => acc.plus(toDecimal(p.amountReceived.toString())),
    toDecimal("0"),
  );
  const balance = toDecimal(invoice.total.toString()).minus(paid);
  const hasTax = !toDecimal(invoice.taxAmount.toString()).isZero();

  const issuerName = issuer.businessName || issuer.name;

  return (
    <Document
      title={`Invoice ${invoice.number ?? "draft"}`}
      author={issuerName}
      subject={`Invoice for ${invoice.client.name}`}
    >
      <Page size="A4" style={styles.page}>
        {invoice.status === "VOID" ? <Text style={styles.voidStamp}>VOID</Text> : null}

        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            {/* This is @react-pdf's Image, not an HTML img -- it renders into a
                PDF content stream and has no alt prop. The wordmark beside it
                carries the name for anything reading the document's text. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_PNG_DATA_URI} style={styles.mark} />
            <Text style={styles.wordmark}>KitaFlux</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>
              {invoice.number ?? "Draft — not yet issued"}
            </Text>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{issuerName}</Text>
            {issuer.businessName && issuer.name !== issuer.businessName ? (
              <Text style={styles.partyLine}>{issuer.name}</Text>
            ) : null}
            <Text style={styles.partyLine}>{issuer.email}</Text>
            {issuer.addressLine ? <Text style={styles.partyLine}>{issuer.addressLine}</Text> : null}
            {issuer.city ? (
              <Text style={styles.partyLine}>
                {issuer.city}
                {issuer.country ? `, ${issuer.country}` : ""}
              </Text>
            ) : null}
            {issuer.tin ? <Text style={styles.partyLine}>TIN {issuer.tin}</Text> : null}
          </View>

          <View style={styles.party}>
            <Text style={styles.partyLabel}>Bill to</Text>
            <Text style={styles.partyName}>{invoice.client.company || invoice.client.name}</Text>
            {invoice.client.company ? (
              <Text style={styles.partyLine}>{invoice.client.name}</Text>
            ) : null}
            <Text style={styles.partyLine}>{invoice.client.email}</Text>
            {invoice.client.addressLine ? (
              <Text style={styles.partyLine}>{invoice.client.addressLine}</Text>
            ) : null}
            <Text style={styles.partyLine}>{invoice.client.country}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Issued</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.issueDate)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Due</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.dueDate)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Currency</Text>
            <Text style={styles.metaValue}>{cur}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Amount due</Text>
            <Text style={styles.metaValue}>{money(balance.toString())}</Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.colDesc, styles.headCell]}>Description</Text>
          <Text style={[styles.colQty, styles.headCell]}>Qty</Text>
          <Text style={[styles.colRate, styles.headCell]}>Rate</Text>
          <Text style={[styles.colAmount, styles.headCell]}>Amount</Text>
        </View>

        {invoice.lineItems.map((item) => (
          <View key={item.id} style={styles.row} wrap={false}>
            <Text style={styles.colDesc}>{item.description}</Text>
            {/* Trailing zeros stripped: "2" reads better than "2.0000000000". */}
            <Text style={styles.colQty}>{toDecimal(item.quantity.toString()).toString()}</Text>
            <Text style={styles.colRate}>{money(item.unitPrice)}</Text>
            <Text style={styles.colAmount}>{money(item.amount)}</Text>
          </View>
        ))}

        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text>{money(invoice.subtotal)}</Text>
            </View>
            {hasTax ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Tax ({toDecimal(invoice.taxRate.toString()).times(100).toString()}%)
                </Text>
                <Text>{money(invoice.taxAmount)}</Text>
              </View>
            ) : null}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>
                {money(invoice.total)} {cur}
              </Text>
            </View>
            {paid.greaterThan(0) ? (
              <>
                <Text style={styles.paidNote}>Paid {money(paid.toString())}</Text>
                <Text style={styles.balanceNote}>
                  {balance.lessThanOrEqualTo(0)
                    ? "Settled in full — thank you."
                    : `Balance ${money(balance.toString())}`}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {issuer.paymentDetails ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Payment details</Text>
            <Text style={styles.blockBody}>{issuer.paymentDetails}</Text>
          </View>
        ) : null}

        {invoice.notes ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Notes</Text>
            <Text style={styles.blockBody}>{invoice.notes}</Text>
          </View>
        ) : null}

        {invoice.terms ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Terms</Text>
            <Text style={styles.blockBody}>{invoice.terms}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {invoice.number ?? "Draft"} · {issuerName}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
