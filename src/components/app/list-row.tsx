import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Phone layout for a table row.
 *
 * Below `sm`, a six-column invoice table either scrolls sideways -- hiding the
 * status and the amount, the two things someone checking on their phone wants
 * -- or crushes every column to nothing. Instead each row becomes two lines
 * with the same shape on every list:
 *
 *   title ........................ amount
 *   meta ..................... amountMeta
 *
 * The whole row is the tap target (the table's per-cell links are too small to
 * hit with a thumb), so it links to the one place a row leads. Secondary
 * actions that must not navigate go in `action`, outside the link.
 *
 * Pair with a TableWrap hidden below the same breakpoint, which keeps the
 * table as the layout from there up:
 *   `sm` (default) -> `<TableWrap className="max-sm:hidden">`
 *   `md`           -> `<TableWrap className="max-md:hidden">`
 * Use `md` for tables with six or more columns: at 640-767px they need more
 * width than the page has and would scroll their last column out of view.
 */
const HIDE_FROM = { sm: "sm:hidden", md: "md:hidden" } as const;

export function ListRows({
  className,
  breakpoint = "sm",
  ...props
}: React.HTMLAttributes<HTMLUListElement> & { breakpoint?: keyof typeof HIDE_FROM }) {
  return <ul className={cn("divide-y", HIDE_FROM[breakpoint], className)} {...props} />;
}

export function ListRow({
  href,
  title,
  meta,
  amount,
  amountMeta,
  action,
  label,
}: {
  href?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  amount?: React.ReactNode;
  amountMeta?: React.ReactNode;
  /** A control beside the row, e.g. remove. Kept outside the link. */
  action?: React.ReactNode;
  /** Accessible name for the link when the visible title alone is ambiguous. */
  label?: string;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">{title}</div>
        {meta ? (
          <div className="mt-0.5 min-w-0 text-xs text-[var(--color-ink-subtle)]">{meta}</div>
        ) : null}
      </div>
      {amount || amountMeta ? (
        <div className="shrink-0 text-right">
          {amount ? <div className="tabular text-sm font-medium">{amount}</div> : null}
          {amountMeta ? (
            <div className="mt-0.5 text-xs text-[var(--color-ink-subtle)]">{amountMeta}</div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <li className="flex items-center">
      {href ? (
        <Link
          href={href}
          aria-label={label}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors active:bg-[var(--color-surface-muted)] focus-visible:bg-[var(--color-surface-muted)] focus-visible:outline-none"
        >
          {body}
          <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--color-ink-subtle)]" />
        </Link>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3">{body}</div>
      )}
      {action ? <div className="shrink-0 pr-2">{action}</div> : null}
    </li>
  );
}
