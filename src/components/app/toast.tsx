"use client";

import { useEffect } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A single transient message, positioned bottom-right on desktop and full-width
 * at the bottom on mobile.
 *
 * Deliberately not a toast *queue*: every place this is used shows the result of
 * one action the user just took, and stacking would only ever hide the newest
 * message behind older ones.
 *
 * Errors do not auto-dismiss -- a failure the user did not read is a failure
 * they will repeat.
 */
export function Toast({
  message,
  tone = "success",
  onDismiss,
  duration = 5000,
}: {
  message: string | null;
  tone?: "success" | "danger";
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message || tone === "danger") return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, tone, duration, onDismiss]);

  if (!message) return null;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 flex items-start gap-2.5 rounded-[var(--radius-card)] px-4 py-3 text-sm shadow-[var(--shadow-pop)]",
        "sm:inset-x-auto sm:right-6 sm:max-w-md",
        tone === "danger"
          ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-ink)]"
          : "bg-[var(--color-success-soft)] text-[var(--color-success-ink)]",
      )}
    >
      {tone === "danger" ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      )}
      <p className="flex-1">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
