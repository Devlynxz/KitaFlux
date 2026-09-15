import { STATUS_LABEL, type Status } from "@/lib/invoice-status";
import { cn } from "@/lib/cn";

/**
 * Status colours follow the brand guide's semantic mapping exactly:
 * success = paid, warning = pending/review, error = overdue. Draft and void are
 * deliberately neutral -- they are not warnings, they are just not in play.
 */
const STYLES: Record<Status, string> = {
  DRAFT: "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]",
  SENT: "bg-[var(--color-info-soft)] text-[var(--color-info-ink)]",
  PAID: "bg-[var(--color-success-soft)] text-[var(--color-success-ink)]",
  OVERDUE: "bg-[var(--color-danger-soft)] text-[var(--color-danger-ink)]",
  VOID: "bg-[var(--color-surface-muted)] text-[var(--color-ink-subtle)] line-through",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
