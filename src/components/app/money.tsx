import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * Every currency figure in the UI renders through here.
 *
 * Two things it guarantees that scattered `formatMoney` calls would not:
 * tabular figures, so columns of numbers align; and a currency tint that is
 * consistent app-wide, read off the mark: foreign currency in the ribbon's
 * cyan (still travelling), PHP in the coin's gold (landed) rather than
 * decided per screen.
 */
export function Money({
  amount,
  currency,
  tint = false,
  withCode = false,
  className,
}: {
  amount: string;
  currency: string;
  /** Colour the figure by currency. Use on headline numbers, not in tables. */
  tint?: boolean;
  withCode?: boolean;
  className?: string;
}) {
  const code = currency.toUpperCase();
  const tintClass = !tint
    ? undefined
    : code === "PHP"
      ? "text-[var(--color-php-ink)]"
      : "text-[var(--color-flow-ink)]";

  return (
    <span className={cn("tabular", tintClass, className)}>
      {formatMoney(amount, code, { withCode })}
    </span>
  );
}

/** A headline figure with its label, as used across the dashboard. */
export function Stat({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs font-medium text-[var(--color-ink-subtle)]">{label}</p>
      <div className="mt-1.5 text-2xl font-semibold">{children}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</div> : null}
    </div>
  );
}
