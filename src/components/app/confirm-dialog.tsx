"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * Confirmation dialog for destructive or irreversible actions.
 *
 * Built on <dialog> so focus trapping, Escape handling and the top layer come
 * from the platform rather than from a hand-rolled focus manager.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Escape and backdrop clicks both route through onCancel, so the parent's
      // state cannot drift out of sync with the dialog's own open attribute.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      className="max-w-md rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-pop)] backdrop:bg-black/45 open:m-auto"
    >
      <div className="p-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">{description}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
