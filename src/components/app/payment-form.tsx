"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";

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
  Textarea,
} from "@/components/ui/primitives";
import { toDateInputValue, todayUtc } from "@/lib/dates";
import { convertPayment, effectiveRate } from "@/lib/fx";
import { formatMoney, formatRate } from "@/lib/money";
import { lookupRateAction, recordPaymentAction } from "@/server/actions/payments";
import type { ActionState } from "@/server/actions/shared";

import { submitWithoutReset } from "./form-submit";

/**
 * Today as the *user's* calendar date, not UTC's.
 *
 * A freelancer in Manila recording a payment at 07:00 on the 16th is still on
 * the 15th in UTC; defaulting (and capping) the date to UTC's today would make
 * their actual date impossible to pick. The server snapshot is the UTC date so
 * the first client render matches the HTML, then the local date takes over.
 */
function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
const noSubscribe = () => () => {};
function useLocalToday(): string {
  return useSyncExternalStore(noSubscribe, localToday, () => toDateInputValue(todayUtc()));
}

/**
 * Recording a payment.
 *
 * The form's job is to make the three amounts visible while they are being
 * entered -- gross, fee, and what actually lands in pesos -- so a wrong rate or
 * a fee in the wrong currency is obvious before it is saved rather than at
 * filing time.
 *
 * The rate is pre-filled from the reference feed but always editable. The
 * mid-market rate is never what a bank actually gives you, so the field the
 * user is expected to correct is the one the whole record hangs on.
 */
export function PaymentForm({
  invoiceId,
  invoiceCurrency,
  homeCurrency,
  balanceDue,
}: {
  invoiceId: string;
  invoiceCurrency: string;
  homeCurrency: string;
  balanceDue: string;
}) {
  const router = useRouter();

  const today = useLocalToday();
  // null until the user picks a date, so the default follows the local date
  // once it is known rather than freezing the server's UTC guess.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const receivedAt = pickedDate ?? today;
  // Fixed to the invoice: "paid" compares amounts against the invoice total,
  // which only works in the invoice's own currency. The server enforces it too.
  const currency = invoiceCurrency;
  const [amountReceived, setAmountReceived] = useState(balanceDue);
  const [feeAmount, setFeeAmount] = useState("0");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [rateSource, setRateSource] = useState("manual");
  const [rateNote, setRateNote] = useState<string | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);

  // The reset and the refresh happen inside the action rather than in an effect
  // reacting to the result. An action runs in a transition, so updating state
  // here is a normal event-driven update; doing it from an effect would be a
  // cascading render triggered by the previous render's output.
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData): Promise<ActionState> => {
      const result = await recordPaymentAction(prev, form);
      if (result.ok) {
        setAmountReceived("");
        setFeeAmount("0");
        setReference("");
        setNote("");
        // Pull the invoice's new status and totals back down.
        router.refresh();
      }
      return result;
    },
    { ok: true } as ActionState,
  );
  const errors = state.ok ? {} : (state.errors ?? {});

  const sameCurrency = currency.toUpperCase() === homeCurrency.toUpperCase();

  // Pull the reference rate whenever the date or currency changes. The user's
  // own edits are preserved: a manual rate is only overwritten by an explicit
  // click on "Refresh".
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (sameCurrency) {
        setFxRate("1");
        setRateSource("same currency");
        setRateNote(null);
        return;
      }
      setFetchingRate(true);
      const result = await lookupRateAction({ invoiceId, date: receivedAt, currency });
      if (cancelled) return;
      setFetchingRate(false);

      if (result.ok) {
        setFxRate(result.rate);
        setRateSource(result.source);
        setRateNote(
          result.quoteDate !== receivedAt
            ? `Latest published reference rate is from ${result.quoteDate}. No rate was published for ${receivedAt} yet (weekends, holidays and today before the ECB publishes).`
            : null,
        );
      } else {
        setRateSource("manual");
        setRateNote(result.message);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // invoiceId is stable for the life of this form.
  }, [receivedAt, currency, sameCurrency, invoiceId]);

  // Live preview using the exact function the server will use.
  const preview = useMemo(() => {
    try {
      const result = convertPayment({
        amountReceived: amountReceived || "0",
        feeAmount: feeAmount || "0",
        currency,
        homeCurrency,
        fxRate: fxRate || "0",
      });
      return { result, error: null as string | null };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : "Check the amounts." };
    }
  }, [amountReceived, feeAmount, currency, homeCurrency, fxRate]);

  async function refreshRate() {
    setFetchingRate(true);
    const result = await lookupRateAction({ invoiceId, date: receivedAt, currency });
    setFetchingRate(false);
    if (result.ok) {
      setFxRate(result.rate);
      setRateSource(result.source);
      setRateNote(null);
    } else {
      setRateNote(result.message);
    }
  }

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="fxRateSource" value={rateSource} />
      <input type="hidden" name="currency" value={currency} />

      {!state.ok ? <Alert title="Could not record this payment">{state.message}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Record a payment</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date received"
            htmlFor="receivedAt"
            required
            error={errors.receivedAt}
            hint="The day it landed, not the day it was sent."
          >
            <Input
              id="receivedAt"
              name="receivedAt"
              type="date"
              value={receivedAt}
              max={today}
              onChange={(e) => setPickedDate(e.target.value)}
              required
            />
          </Field>

          <Field
            label={`Amount received (${currency})`}
            htmlFor="amountReceived"
            required
            error={errors.amountReceived}
            hint={`Gross, before fees, in the invoice currency. Balance due is ${formatMoney(balanceDue, invoiceCurrency)}.`}
          >
            <MoneyInput
              id="amountReceived"
              name="amountReceived"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              placeholder="0.00"
              required
            />
          </Field>

          <Field
            label="Platform fee"
            htmlFor="feeAmount"
            error={errors.feeAmount}
            hint={`What Wise, Payoneer or PayPal kept, in ${currency}.`}
          >
            <MoneyInput
              id="feeAmount"
              name="feeAmount"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field
            label={`Exchange rate (${currency} to ${homeCurrency})`}
            htmlFor="fxRate"
            required
            error={errors.fxRate}
            hint={
              rateNote ??
              (sameCurrency
                ? "Same currency, so the rate is 1."
                : rateSource === "manual"
                  ? "Enter the rate your bank or platform actually gave you."
                  : `Reference rate from ${rateSource}. Replace it with the rate your bank actually gave you.`)
            }
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <MoneyInput
                id="fxRate"
                name="fxRate"
                value={fxRate}
                onChange={(e) => {
                  setFxRate(e.target.value);
                  setRateSource("manual");
                }}
                placeholder={fetchingRate ? "Fetching…" : "0.000000"}
                // readOnly, not disabled: a disabled input is left out of the
                // submitted form, and the server then rejects the payment for
                // a missing rate.
                readOnly={sameCurrency}
                required
              />
              <Button
                variant="secondary"
                size="icon"
                onClick={refreshRate}
                disabled={sameCurrency || fetchingRate}
                aria-label="Fetch the reference rate again"
                title="Fetch the reference rate again"
              >
                <RefreshCw className={fetchingRate ? "animate-spin" : undefined} />
              </Button>
            </div>
          </Field>

          <Field
            label="Reference"
            htmlFor="reference"
            error={errors.reference}
            hint="Transaction ID from your bank or platform."
          >
            <Input
              id="reference"
              name="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="WISE-8842013"
            />
          </Field>

          <Field label="Note" htmlFor="note" error={errors.note}>
            <Textarea id="note" name="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      {/* The three numbers, side by side, before anything is committed. */}
      <Card>
        <CardBody>
          {preview.error ? (
            <p className="text-sm text-[var(--color-danger)]">{preview.error}</p>
          ) : preview.result ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--color-ink-subtle)]">They sent</dt>
                <dd className="tabular mt-1 text-lg font-semibold">
                  {formatMoney(preview.result.gross, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-subtle)]">After fees</dt>
                <dd className="tabular mt-1 text-lg font-semibold">
                  {formatMoney(preview.result.net, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-subtle)]">Lands in your bank</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-[var(--color-php)]">
                  {formatMoney(preview.result.homeAmount, homeCurrency)}
                </dd>
              </div>
              {!sameCurrency && preview.result.gross.greaterThan(0) ? (
                <div className="sm:col-span-3">
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Effective rate after fees:{" "}
                    <span className="tabular font-medium">
                      {formatRate(effectiveRate(preview.result))}
                    </span>{" "}
                    {homeCurrency} per {currency}
                  </p>
                </div>
              ) : null}
            </dl>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || Boolean(preview.error)}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
