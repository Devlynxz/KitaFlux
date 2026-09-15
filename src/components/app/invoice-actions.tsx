"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Download, Send, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { Status } from "@/lib/invoice-status";
import {
  deleteInvoiceAction,
  resendInvoiceAction,
  sendInvoiceAction,
  voidInvoiceAction,
} from "@/server/actions/invoices";

import { ConfirmDialog } from "./confirm-dialog";
import { Toast } from "./toast";

type Dialog = "send" | "void" | "delete" | null;

export function InvoiceActions({
  invoiceId,
  status,
  clientEmail,
  emailConfigured,
}: {
  invoiceId: string;
  status: Status;
  clientEmail: string;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setDialog(null);
    start(async () => {
      const result = await fn();
      if (result.message) {
        setToast({ message: result.message, tone: result.ok ? "success" : "danger" });
      }
      if (result.ok) router.refresh();
    });
  }

  const isDraft = status === "DRAFT";
  const canVoid = status !== "PAID" && status !== "VOID";
  const canResend = status === "SENT" || status === "OVERDUE";

  return (
    <>
      <a
        href={`/invoices/${invoiceId}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "secondary" })}
      >
        <Download /> PDF
      </a>

      {isDraft ? (
        <Button onClick={() => setDialog("send")} disabled={pending}>
          <Send /> {pending ? "Sending…" : "Send invoice"}
        </Button>
      ) : null}

      {canResend ? (
        <Button
          variant="secondary"
          onClick={() => run(() => resendInvoiceAction(invoiceId))}
          disabled={pending || !emailConfigured}
          title={emailConfigured ? undefined : "Email is not configured"}
        >
          <Send /> Send again
        </Button>
      ) : null}

      {canVoid ? (
        <Button variant="ghost" onClick={() => setDialog("void")} disabled={pending}>
          <Ban /> Void
        </Button>
      ) : null}

      {isDraft ? (
        <Button variant="ghost" onClick={() => setDialog("delete")} disabled={pending}>
          <Trash2 /> Delete
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === "send"}
        title="Send this invoice?"
        description={
          emailConfigured
            ? `It will be numbered, locked from further edits, and emailed to ${clientEmail} with the PDF attached.`
            : `It will be numbered and locked from further edits. Email is not configured, so nothing will be sent — download the PDF and send it yourself.`
        }
        confirmLabel={emailConfigured ? "Send invoice" : "Mark as sent"}
        tone="primary"
        onConfirm={() => run(() => sendInvoiceAction(invoiceId))}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === "void"}
        title="Void this invoice?"
        description="The number stays in your series so there is no gap, but the invoice no longer counts towards anything you are owed. This cannot be undone."
        confirmLabel="Void invoice"
        onConfirm={() => run(() => voidInvoiceAction(invoiceId))}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this draft?"
        description="It has no number yet, so nothing is lost from your invoice series. This cannot be undone."
        confirmLabel="Delete draft"
        onConfirm={() => run(() => deleteInvoiceAction(invoiceId))}
        onCancel={() => setDialog(null)}
      />

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "success"}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}
