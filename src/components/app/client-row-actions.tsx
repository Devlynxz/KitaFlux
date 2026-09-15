"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { archiveClientAction, deleteClientAction } from "@/server/actions/clients";

import { ConfirmDialog } from "./confirm-dialog";
import { Toast } from "./toast";

export function ClientRowActions({
  clientId,
  archived,
  invoiceCount,
}: {
  clientId: string;
  archived: boolean;
  invoiceCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A client with invoices cannot be deleted (the FK is Restrict, and losing
  // the counterparty on a filed invoice would be worse than a stale row).
  const deletable = invoiceCount === 0;

  function toggleArchive() {
    start(async () => {
      const result = await archiveClientAction(clientId, !archived);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  function confirmedDelete() {
    setConfirmDelete(false);
    start(async () => {
      const result = await deleteClientAction(clientId);
      // On success the action redirects, so reaching here means it failed.
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={toggleArchive} disabled={pending}>
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? "Restore" : "Archive"}
      </Button>

      {deletable ? (
        <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={pending}>
          <Trash2 /> Delete
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this client?"
        description="This client has no invoices, so deleting is safe. It cannot be undone."
        confirmLabel="Delete client"
        tone="danger"
        onConfirm={confirmedDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <Toast message={error} tone="danger" onDismiss={() => setError(null)} />
    </>
  );
}
