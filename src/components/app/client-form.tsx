"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardBody,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { COUNTRIES, COUNTRY_CURRENCY } from "@/lib/countries";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import type { ActionState } from "@/server/actions/shared";

import { submitWithoutReset } from "./form-submit";

export interface ClientFormDefaults {
  name?: string;
  email?: string;
  company?: string | null;
  country?: string;
  currency?: string;
  addressLine?: string | null;
  notes?: string | null;
}

export function ClientForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  defaults?: ClientFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as ActionState);
  const errors = state.ok ? {} : (state.errors ?? {});

  // Currency follows the country until the user picks one explicitly. After
  // that it stays put -- a US client billed in EUR is a real situation and
  // should not be overwritten on the next country change.
  const [country, setCountry] = useState(defaults?.country ?? "US");
  const [currency, setCurrency] = useState(defaults?.currency ?? "USD");
  const [currencyTouched, setCurrencyTouched] = useState(Boolean(defaults?.currency));

  function onCountryChange(next: string) {
    setCountry(next);
    if (!currencyTouched) {
      const suggested = COUNTRY_CURRENCY[next];
      if (suggested) setCurrency(suggested);
    }
  }

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      {!state.ok ? <Alert title="Could not save">{state.message}</Alert> : null}

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={errors.name} className="sm:col-span-2">
            <Input
              id="name"
              name="name"
              defaultValue={defaults?.name}
              required
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              placeholder="Jordan Reyes"
            />
          </Field>

          <Field
            label="Email"
            htmlFor="email"
            required
            error={errors.email}
            hint="Invoices and reminders are sent here."
          >
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaults?.email}
              required
              aria-invalid={Boolean(errors.email)}
              placeholder="jordan@acme.com"
            />
          </Field>

          <Field label="Company" htmlFor="company" error={errors.company}>
            <Input
              id="company"
              name="company"
              defaultValue={defaults?.company ?? ""}
              placeholder="Acme Inc."
            />
          </Field>

          <Field label="Country" htmlFor="country" required error={errors.country}>
            <Select
              id="country"
              name="country"
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Billing currency"
            htmlFor="currency"
            required
            error={errors.currency}
            hint="The currency invoices for this client default to."
          >
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

          <Field
            label="Address"
            htmlFor="addressLine"
            error={errors.addressLine}
            hint="Appears on the invoice."
            className="sm:col-span-2"
          >
            <Textarea
              id="addressLine"
              name="addressLine"
              defaultValue={defaults?.addressLine ?? ""}
              rows={2}
            />
          </Field>

          <Field
            label="Internal notes"
            htmlFor="notes"
            error={errors.notes}
            hint="Only you see this. Never appears on an invoice."
            className="sm:col-span-2"
          >
            <Textarea id="notes" name="notes" defaultValue={defaults?.notes ?? ""} rows={3} />
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
