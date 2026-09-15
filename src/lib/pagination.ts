/**
 * Page-numbered list pagination.
 *
 * Offset pages (`?page=3`) rather than cursors. A freelancer's invoice history
 * runs to hundreds of rows, not millions, so OFFSET cost is irrelevant; what
 * matters is that a page is a plain URL that survives a refresh, can be shared,
 * and composes with the existing GET filter forms. Every list that uses this
 * orders by a unique tiebreaker (the id) so a row can never appear on two pages
 * or fall between them.
 */

export const PAGE_SIZE = 25;

export interface Page<T> {
  items: T[];
  /** Rows matching the filter, across every page. */
  total: number;
  /** 1-based, already clamped into range. */
  page: number;
  pageSize: number;
  /** At least 1, so "page 1 of 1" holds for an empty list. */
  pageCount: number;
}

/**
 * Read `?page=` from a URL. Anything that is not a positive whole number --
 * missing, "abc", "-2", "1.5", "1e3" -- is page 1. Upper bounds are clamped
 * later, once the total is known.
 */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,9}$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? n : 1;
}

/**
 * Where a page starts, given how many rows exist. A page past the end clamps to
 * the last page rather than rendering empty: after deleting the only row on
 * page 4, the user should land on page 3, not on "nothing here".
 */
export function pageBounds(
  total: number,
  requested: number,
  pageSize: number = PAGE_SIZE,
): { page: number; pageCount: number; skip: number; take: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requested)), pageCount);
  return { page, pageCount, skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * The page numbers to show as links: always the first and last, the current
 * page and one either side, with `null` marking a gap.
 *
 *   pageWindow(1, 1)   -> [1]
 *   pageWindow(5, 12)  -> [1, null, 4, 5, 6, null, 12]
 *   pageWindow(2, 12)  -> [1, 2, 3, null, 12]
 *
 * A gap of exactly one page is filled with that page instead of an ellipsis,
 * since "…" standing in for a single number saves nothing.
 */
export function pageWindow(page: number, pageCount: number): Array<number | null> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const out: Array<number | null> = [];
  for (const p of pages) {
    const prev = out.length ? out[out.length - 1] : null;
    if (typeof prev === "number" && p - prev === 2) out.push(prev + 1);
    else if (typeof prev === "number" && p - prev > 2) out.push(null);
    out.push(p);
  }
  return out;
}
