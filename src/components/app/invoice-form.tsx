"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { addDays, toDateInputValue, todayUtc } from "@/lib/dates";
import { formatMoney, invoiceTotals, SUPPORTED_CURRENCIES } from "@/lib/money";
import type { ActionState } from "@/server/actions/shared";

import { submitWithoutReset } from "./form-submit";

export interface InvoiceFormClient {
  id: string;
  name: string;
  company: string | null;
  currency: string;
}

export interface InvoiceFormDefaults {
  clientId?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  taxRate?: string;
  notes?: string | null;
  terms?: string | null;
  lineItems?: Array<{ description: string; quantity: string; unitPrice: string }>;
}

interface Line {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 0;
const newLine = (): Line => ({
  key: `line-${nextKey++}`,
  description: "",
  quantity: "1",
  unitPrice: "",
});

export function InvoiceForm({
  action,
  clients,
  defaults,
  submitLabel,
  numberHint,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  clients: InvoiceFormClient[];
  defaults?: InvoiceFormDefaults;
  submitLabel: string;
  /** The number this invoice will get when sent. A hint, not a reservation. */
  numberHint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as ActionState);
  const errors = state.ok ? {} : (state.errors ?? {});

  const [clientId, setClientId] = useState(defaults?.clientId ?? clients[0]?.id ?? "");
  const [currency, setCurrency] = useState(
    defaults?.currency ?? clients.find((c) => c.id === defaults?.clientId)?.currency ?? "USD",
  );
  const [currencyTouched, setCurrencyTouched] = useState(Boolean(defaults?.currency));
  const [taxRate, setTaxRate] = useState(defaults?.taxRate ?? "0");
  const [lines, setLines] = useState<Line[]>(
    defaults?.lineItems?.length
      ? defaults.lineItems.map((l) => ({ ...l, key: `line-${nextKey++}` }))
      : [newLine()],
  );

  // Totals recompute live using the same functions the server uses, so the
  // preview can never disagree with what gets stored.
  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines.map((l) => ({ quantity: l.quantity || "0", unitPrice: l.unitPrice || "0" })),
        taxRate || "0",
        currency,
      );
    } catch {
      // A half-typed "1." is not an error worth showing; the preview just holds.
      return null;
    }
  }, [lines, taxRate, currency]);

  function onClientChange(id: string) {
    setClientId(id);
    if (!currencyTouched) {
      const c = clients.find((x) => x.id === id);
      if (c) setCurrency(c.currency);
    }
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const today = toDateInputValue(todayUtc());
  const defaultDue = toDateInputValue(addDays(todayUtc(), 14));

  if (clients.length === 0) {
    return (
      <Alert tone="warning" title="Add a client first">
        An invoice needs someone to bill. Add a client, then come back.
      </Alert>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      {!state.ok ? <Alert title="Could not save">{state.message}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          {numberHint ? (
            <span className="text-xs text-[var(--color-ink-subtle)]">
              Will be numbered <span className="tabular font-medium">{numberHint}</span> when sent
            </span>
          ) : null}
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" htmlFor="clientId" required error={errors.clientId}>
            <Select
              id="clientId"
              name="clientId"
              value={clientId}
              onChange={(e) => onClientChange(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company ? `${c.name} — ${c.company}` : c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Currency" htmlFor="currency" required error={errors.currency}>
            <Select
              id="currency"
              name="currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setCurrencyTouched(true);
              }}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Issue date" htmlFor="issueDate" required error={errors.issueDate}>
            <Input
              id="issueDate"
              name="issueDate"
              type="date"
              defaultValue={defaults?.issueDate ?? today}
              required
            />
          </Field>

          <Field
            label="Due date"
            htmlFor="dueDate"
            required
            error={errors.dueDate}
            hint="Reminders go out automatically after this date."
          >
            <Input
              id="dueDate"
              name="dueDate"
              type="date"
              defaultValue={defaults?.dueDate ?? defaultDue}
              required
            />
          </Field>

          <Field
            label="Tax rate"
            htmlFor="taxRate"
            error={errors.taxRate}
            hint="As a fraction: 0.12 for 12% VAT. Leave 0 if you do not add tax."
          >
            <MoneyInput
              id="taxRate"
              name="taxRate"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="0"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          {errors.lineItems ? (
            <span className="text-xs text-[var(--color-danger)]">{errors.lineItems}</span>
          ) : null}
        </CardHeader>
        <CardBody className="space-y-3">
          {/* Column headings, desktop only -- on mobile each field carries its
              own label instead, because a 4-column grid is unreadable there. */}
          <div className="hidden gap-3 px-1 text-xs font-medium text-[var(--color-ink-subtle)] sm:grid sm:grid-cols-[1fr_5rem_8rem_8rem_2.25rem]">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {lines.map((line, i) => {
            let amount = "";
            try {
              amount = formatMoney(
                invoiceTotals(
                  [{ quantity: line.quantity || "0", unitPrice: line.unitPrice || "0" }],
                  "0",
                  currency,
                ).subtotal,
                currency,
              );
            } catch {
              amount = "—";
            }

            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-[var(--radius-control)] border p-3 sm:grid-cols-[1fr_5rem_8rem_8rem_2.25rem] sm:items-center sm:border-0 sm:p-0"
              >
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-ink-subtle)] sm:hidden">
                    Description
                  </label>
                  <Input
                    name={`lineItems[${i}].description`}
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="Frontend development, March"
                    aria-label={`Line ${i + 1} description`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--color-ink-subtle)] sm:hidden">
                    Quantity
                  </label>
                  <MoneyInput
                    name={`lineItems[${i}].quantity`}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    aria-label={`Line ${i + 1} quantity`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--color-ink-subtle)] sm:hidden">
                    Rate
                  </label>
                  <MoneyInput
                    name={`lineItems[${i}].unitPrice`}
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Line ${i + 1} rate`}
                  />
                </div>

                <div className="flex items-center justify-between sm:justify-end">
                  <span className="text-xs text-[var(--color-ink-subtle)] sm:hidden">Amount</span>
                  <span className="tabular text-sm font-medium">{amount}</span>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines((p) => (p.length === 1 ? p : p.filter((l) => l.key !== line.key)))}
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}

          <Button variant="secondary" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
            <Plus /> Add line
          </Button>

          {totals ? (
            <div className="flex justify-end border-t pt-4">
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-ink-muted)]">Subtotal</dt>
                  <dd className="tabular">{formatMoney(totals.subtotal, currency)}</dd>
                </div>
                {!totals.taxAmount.isZero() ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-ink-muted)]">Tax</dt>
                    <dd className="tabular">{formatMoney(totals.taxAmount, currency)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">
                    {formatMoney(totals.total, currency)} {currency}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes and terms</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Notes"
            htmlFor="notes"
            error={errors.notes}
            hint="Shown on the invoice and in the email."
          >
            <Textarea id="notes" name="notes" defaultValue={defaults?.notes ?? ""} rows={3} />
          </Field>
          <Field
            label="Terms"
            htmlFor="terms"
            error={errors.terms}
            hint="Payment terms, late fees, anything contractual."
          >
            <Textarea id="terms" name="terms" defaultValue={defaults?.terms ?? ""} rows={3} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
