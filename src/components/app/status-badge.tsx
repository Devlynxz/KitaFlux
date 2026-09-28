import { STATUS_LABEL, type Status } from "@/lib/invoice-status";
import { cn } from "@/lib/cn";

/**
 * Status colours follow the brand guide's semantic mapping exactly:
 * success = paid, info = sent, error = overdue. Draft and void are deliberately
 * neutral -- they are not warnings, they are just not in play. Nothing here is
 * amber: amber is the peso coin.
 *
 * Every badge is a dot plus the word, so no status is told apart by colour alone.
 */
const STYLES: Record<Status, { badge: string; dot: string }> = {
  DRAFT: { badge: "bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]", dot: "bg-current" },
  SENT: { badge: "bg-[var(--color-info-soft)] text-[var(--color-info-ink)]", dot: "bg-[var(--color-primary)]" },
  PAID: { badge: "bg-[var(--color-success-soft)] text-[var(--color-success-ink)]", dot: "bg-[var(--color-success)]" },
  OVERDUE: { badge: "bg-[var(--color-danger-soft)] text-[var(--color-danger-ink)]", dot: "bg-[var(--color-danger)]" },
  VOID: { badge: "bg-[var(--color-surface-muted)] text-[var(--color-ink-subtle)] line-through", dot: "bg-current" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-xs font-medium",
        STYLES[status].badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", STYLES[status].dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}
