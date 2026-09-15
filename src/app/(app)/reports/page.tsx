import Link from "next/link";
import type { Metadata } from "next";
import { Download, Receipt } from "lucide-react";

import { ListRow, ListRows } from "@/components/app/list-row";
import { Money } from "@/components/app/money";
import { buttonVariants } from "@/components/ui/button";
import {
  Alert,
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
import {
  formatDate,
  formatQuarter,
  quarterFilingDeadline,
  quarterOf,
  recentQuarters,
  type Quarter,
} from "@/lib/dates";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { getQuarterlyReport } from "@/server/data/reports";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Reports" };

function parseQuarter(value: string | undefined, fallback: Quarter): Quarter {
  const match = /^(\d{4})-Q([1-4])$/.exec(value ?? "");
  if (!match) return fallback;
  const year = Number(match[1]);
  // Same bounds as the CSV export, so the page and its download always agree.
  if (year < 2000 || year > 2100) return fallback;
  return { year, quarter: Number(match[2]) as 1 | 2 | 3 | 4 };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const options = recentQuarters(8);
  const quarter = parseQuarter(params.q, quarterOf(new Date()));
  const report = await getQuarterlyReport(user.id, quarter, user.homeCurrency);
  const key = `${quarter.year}-Q${quarter.quarter}`;

  return (
    <>
      <PageHeader
        title="Quarterly summary"
        description="Gross receipts in pesos, from the rate on each payment date."
        actions={
          report.paymentCount > 0 ? (
            <a href={`/reports/export?q=${key}`} className={buttonVariants()}>
              <Download /> Export CSV
            </a>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Choose a quarter">
        {options.map((q) => {
          const value = `${q.year}-Q${q.quarter}`;
          const active = value === key;
          return (
            <Link
              key={value}
              href={`/reports?q=${value}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                  : "border bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]",
              )}
            >
              {formatQuarter(q)}
            </Link>
          );
        })}
      </div>

      {report.paymentCount === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt className="size-5" />}
            title={`No payments in ${report.label}`}
            description="Once you record payments received during this quarter, the peso totals and the per-client breakdown appear here."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-xs font-medium text-[var(--color-ink-subtle)]">
                  Gross receipts
                </p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                  <Money amount={report.grossHome} currency={report.homeCurrency} tint />
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  Before platform fees
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs font-medium text-[var(--color-ink-subtle)]">
                  Platform fees
                </p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--color-warning)]">
                  <Money amount={report.feesHome} currency={report.homeCurrency} />
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  Converted at each payment&rsquo;s rate
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs font-medium text-[var(--color-ink-subtle)]">
                  Net received
                </p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                  <Money amount={report.netHome} currency={report.homeCurrency} />
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  {report.paymentCount} payment{report.paymentCount === 1 ? "" : "s"} · landed in
                  your bank
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By client</CardTitle>
              </CardHeader>
              <ListRows>
                {report.byClient.map((c) => (
                  <ListRow
                    key={c.clientId}
                    href={`/clients/${c.clientId}`}
                    title={<span className="truncate">{c.clientName}</span>}
                    meta={`${countryName(c.country)} · ${c.paymentCount} payment${c.paymentCount === 1 ? "" : "s"}`}
                    amount={<Money amount={c.grossHome} currency={report.homeCurrency} />}
                    amountMeta={c.grossByCurrency.map((g, i) => (
                      <span key={g.currency} className="tabular">
                        {i > 0 ? " + " : ""}
                        <Money amount={g.amount} currency={g.currency} withCode />
                      </span>
                    ))}
                  />
                ))}
              </ListRows>
              <TableWrap className="max-sm:hidden">
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Received</Th>
                    <Th numeric>Gross {report.homeCurrency}</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.byClient.map((c) => (
                    <tr key={c.clientId} className="last:[&>td]:border-b-0">
                      <Td>
                        <Link href={`/clients/${c.clientId}`} className="font-medium hover:underline">
                          {c.clientName}
                        </Link>
                        <div className="text-xs text-[var(--color-ink-subtle)]">
                          {countryName(c.country)} · {c.paymentCount} payment
                          {c.paymentCount === 1 ? "" : "s"}
                        </div>
                      </Td>
                      <Td>
                        {c.grossByCurrency.map((g) => (
                          <div key={g.currency} className="tabular text-xs">
                            <Money amount={g.amount} currency={g.currency} withCode />
                          </div>
                        ))}
                      </Td>
                      <Td numeric>
                        <Money amount={c.grossHome} currency={report.homeCurrency} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By currency</CardTitle>
              </CardHeader>
              <ListRows>
                {report.byCurrency.map((c) => (
                  <ListRow
                    key={c.currency}
                    title={<span className="tabular">{c.currency}</span>}
                    meta={
                      <span className="tabular">
                        {formatMoney(c.gross, c.currency)} gross · {formatMoney(c.fees, c.currency)} fees
                      </span>
                    }
                    amount={<Money amount={c.homeNet} currency={report.homeCurrency} />}
                    amountMeta={`net ${report.homeCurrency}`}
                  />
                ))}
              </ListRows>
              <TableWrap className="max-sm:hidden">
                <thead>
                  <tr>
                    <Th>Currency</Th>
                    <Th numeric>Gross</Th>
                    <Th numeric>Fees</Th>
                    <Th numeric>Net {report.homeCurrency}</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCurrency.map((c) => (
                    <tr key={c.currency} className="last:[&>td]:border-b-0">
                      <Td>
                        <span className="tabular font-medium">{c.currency}</span>
                      </Td>
                      <Td numeric>
                        <Money amount={c.gross} currency={c.currency} />
                      </Td>
                      <Td numeric>
                        <Money amount={c.fees} currency={c.currency} />
                      </Td>
                      <Td numeric>
                        <Money amount={c.homeNet} currency={report.homeCurrency} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>
          </div>

          <Alert tone="info" className="mt-4">
            <p>
              {report.label} covers payments received from {formatDate(report.start)} up to{" "}
              {formatDate(new Date(report.end.getTime() - 86_400_000))}. The BIR 1701Q for this
              quarter is generally due {formatDate(quarterFilingDeadline(report.quarter))}.
            </p>
            <p className="mt-2">
              These are your own records, presented for your reference. KitaFlux does not compute
              tax owed and is not tax advice — check the figures with your accountant before filing.
            </p>
          </Alert>
        </>
      )}
    </>
  );
}
