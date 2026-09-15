"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { COUNTRIES } from "@/lib/countries";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { updateSettingsAction } from "@/server/actions/settings";
import type { ActionState } from "@/server/actions/shared";

import { submitWithoutReset } from "./form-submit";
import { Toast } from "./toast";

export interface SettingsDefaults {
  name: string;
  businessName: string | null;
  tin: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  defaultCurrency: string;
  homeCurrency: string;
  paymentDetails: string | null;
  invoicePrefix: string;
  invoiceNotes: string | null;
}

export function SettingsForm({
  defaults,
  email,
  issuedCount,
}: {
  defaults: SettingsDefaults;
  email: string;
  issuedCount: number;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [prefix, setPrefix] = useState(defaults.invoicePrefix);

  // Raising the toast inside the action keeps it an event-driven update rather
  // than an effect reacting to the previous render.
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData): Promise<ActionState> => {
      const result = await updateSettingsAction(prev, form);
      if (result.ok && result.message) setToast(result.message);
      return result;
    },
    { ok: true } as ActionState,
  );
  const errors = state.ok ? {} : (state.errors ?? {});

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      {!state.ok ? <Alert title="Could not save">{state.message}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>You and your business</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" defaultValue={defaults.name} required />
          </Field>

          <Field
            label="Business name"
            htmlFor="businessName"
            error={errors.businessName}
            hint="Shown on invoices instead of your name, if set."
          >
            <Input
              id="businessName"
              name="businessName"
              defaultValue={defaults.businessName ?? ""}
            />
          </Field>

          <Field label="Email" hint="Used to sign in. Contact support to change it.">
            <Input value={email} readOnly disabled />
          </Field>

          <Field
            label="TIN"
            htmlFor="tin"
            error={errors.tin}
            hint="Printed on your invoices. Optional."
          >
            <Input id="tin" name="tin" defaultValue={defaults.tin ?? ""} placeholder="123-456-789-000" />
          </Field>

          <Field label="Address" htmlFor="addressLine" error={errors.addressLine}>
            <Input id="addressLine" name="addressLine" defaultValue={defaults.addressLine ?? ""} />
          </Field>

          <Field label="City" htmlFor="city" error={errors.city}>
            <Input id="city" name="city" defaultValue={defaults.city ?? ""} />
          </Field>

          <Field label="Country" htmlFor="country" required error={errors.country}>
            <Select id="country" name="country" defaultValue={defaults.country}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Default billing currency"
            htmlFor="defaultCurrency"
            required
            error={errors.defaultCurrency}
            hint="Pre-selected when you add a client or raise an invoice."
          >
            <Select
              id="defaultCurrency"
              name="defaultCurrency"
              defaultValue={defaults.defaultCurrency}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Reporting currency"
            htmlFor="homeCurrency"
            required
            error={errors.homeCurrency}
            hint="What you file taxes in. Payments already recorded keep the rate they were saved with."
          >
            <Select id="homeCurrency" name="homeCurrency" defaultValue={defaults.homeCurrency}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoicing</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Invoice prefix"
            htmlFor="invoicePrefix"
            required
            error={errors.invoicePrefix}
            hint={`Your next invoice will be ${prefix || "INV"}-${String(issuedCount + 1).padStart(4, "0")}.`}
          >
            <Input
              id="invoicePrefix"
              name="invoicePrefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              required
            />
          </Field>

          <Field
            label="Invoices issued"
            hint="Numbering is sequential and gapless. It cannot be reset."
          >
            <Input value={issuedCount} readOnly disabled className="tabular" />
          </Field>

          <Field
            label="Payment details"
            htmlFor="paymentDetails"
            error={errors.paymentDetails}
            hint="Bank, Wise or Payoneer details. Printed on every invoice."
            className="sm:col-span-2"
          >
            <Textarea
              id="paymentDetails"
              name="paymentDetails"
              defaultValue={defaults.paymentDetails ?? ""}
              rows={4}
              placeholder={"Wise (USD)\nAccount: Juan dela Cruz\nRouting: 000000000\nAccount no: 0000000000"}
            />
          </Field>

          <Field
            label="Default invoice notes"
            htmlFor="invoiceNotes"
            error={errors.invoiceNotes}
            hint="Reference text for yourself. Not applied automatically to new invoices."
            className="sm:col-span-2"
          >
            <Textarea
              id="invoiceNotes"
              name="invoiceNotes"
              defaultValue={defaults.invoiceNotes ?? ""}
              rows={3}
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </form>
  );
}
