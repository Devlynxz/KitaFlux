import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { pageWindow, type Page } from "@/lib/pagination";

/**
 * Page links under a list.
 *
 * A server component that renders plain links, so paging works before
 * hydration, keeps the browser's back button meaningful, and carries the
 * current filters (`?status=OVERDUE&q=acme`) onto every page it links to.
 *
 * Renders nothing for a single page: "Page 1 of 1" is chrome with no use.
 * On a phone only Previous / Next and the position are shown; the numbered run
 * returns from `sm` up, where there is room for it.
 */
export function Pagination({
  page,
  basePath,
  params = {},
  noun,
  className,
}: {
  page: Pick<Page<unknown>, "page" | "pageCount" | "pageSize" | "total">;
  basePath: string;
  /** The other query parameters to keep, e.g. the active filter and search. */
  params?: Record<string, string | undefined>;
  /** Plural noun for the range line: "invoices". */
  noun: string;
  className?: string;
}) {
  if (page.pageCount <= 1) return null;

  const hrefFor = (n: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    if (n > 1) query.set("page", String(n));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);
  const hasPrev = page.page > 1;
  const hasNext = page.page < page.pageCount;

  const step = cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-9 px-3");
  const disabled = "pointer-events-none opacity-50";

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5",
        className,
      )}
    >
      <p className="text-xs text-[var(--color-ink-muted)]">
        <span className="tabular">
          {first}–{last}
        </span>{" "}
        of <span className="tabular">{page.total}</span> {noun}
      </p>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        {hasPrev ? (
          <Link href={hrefFor(page.page - 1)} className={step} rel="prev">
            <ChevronLeft /> Previous
          </Link>
        ) : (
          <span className={cn(step, disabled)} aria-disabled="true">
            <ChevronLeft /> Previous
          </span>
        )}

        <span className="text-xs text-[var(--color-ink-muted)] sm:hidden">
          Page <span className="tabular">{page.page}</span> of{" "}
          <span className="tabular">{page.pageCount}</span>
        </span>

        <ol className="hidden items-center gap-1 sm:flex">
          {pageWindow(page.page, page.pageCount).map((n, i) =>
            n === null ? (
              <li key={`gap-${i}`} aria-hidden className="px-1 text-xs text-[var(--color-ink-subtle)]">
                …
              </li>
            ) : (
              <li key={n}>
                <Link
                  href={hrefFor(n)}
                  aria-current={n === page.page ? "page" : undefined}
                  aria-label={`Page ${n}`}
                  className={cn(
                    "tabular inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] px-2 text-xs font-medium transition-colors",
                    n === page.page
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                      : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]",
                  )}
                >
                  {n}
                </Link>
              </li>
            ),
          )}
        </ol>

        {hasNext ? (
          <Link href={hrefFor(page.page + 1)} className={step} rel="next">
            Next <ChevronRight />
          </Link>
        ) : (
          <span className={cn(step, disabled)} aria-disabled="true">
            Next <ChevronRight />
          </span>
        )}
      </div>
    </nav>
  );
}
