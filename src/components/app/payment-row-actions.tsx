"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deletePaymentAction } from "@/server/actions/payments";

import { ConfirmDialog } from "./confirm-dialog";
import { Toast } from "./toast";

export function PaymentRowActions({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setConfirm(false);
    start(async () => {
      const result = await deletePaymentAction(paymentId);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirm(true)}
        disabled={pending}
        aria-label="Remove this payment"
      >
        <Trash2 />
      </Button>

      <ConfirmDialog
        open={confirm}
        title="Remove this payment?"
        description="The invoice will go back to unpaid, and this amount will drop out of your quarterly totals."
        confirmLabel="Remove payment"
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />

      <Toast message={error} tone="danger" onDismiss={() => setError(null)} />
    </>
  );
}
