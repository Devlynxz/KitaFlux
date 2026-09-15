/**
 * Date handling.
 *
 * Invoice dates and payment dates are calendar dates, not instants. They are
 * stored in `date` columns and handled here as UTC-midnight `Date` objects so
 * that a freelancer in Manila (UTC+8) recording a payment at 08:00 local time
 * does not get a row dated the previous day.
 *
 * The rule: anything that comes off a `@db.Date` column, or goes into one, is
 * UTC-midnight. Anything with a real time component (sentAt, createdAt) is a
 * plain timestamp and does not come through here.
 */

/** UTC midnight of the calendar day a Date falls on. */
export function toUtcDate(value: Date | string): Date {
  const d = typeof value === "string" ? parseDateInput(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Parse a `yyyy-mm-dd` string from a date input.
 *
 * `new Date("2026-03-01")` already parses as UTC midnight, but
 * `new Date("2026/03/01")` parses as *local* midnight, and browsers disagree on
 * anything else. Parsing the parts explicitly removes the guesswork.
 */
export function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) throw new Error(`Not a valid date: ${value}`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) throw new Error(`Not a valid date: ${value}`);
  return date;
}

/** Today, as UTC midnight. */
export function todayUtc(now: Date = new Date()): Date {
  return toUtcDate(now);
}

/** `yyyy-mm-dd`, the format `<input type="date">` expects. */
export function toDateInputValue(value: Date): string {
  return toUtcDate(value).toISOString().slice(0, 10);
}

export function addDays(value: Date, days: number): Date {
  const d = toUtcDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  const ms = toUtcDate(to).getTime() - toUtcDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function isBefore(a: Date, b: Date): boolean {
  return toUtcDate(a).getTime() < toUtcDate(b).getTime();
}

/** Human date for the UI and for PDFs: "05 Mar 2026". Locale-independent. */
export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? parseDateInput(value) : toUtcDate(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Timestamp for audit lines: "05 Mar 2026, 14:32". */
export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

/**
 * "Due in 12 days" / "9 days overdue" / "Due today".
 *
 * Future dates stop being counted past a year. A day count is a thing someone
 * can act on; "Due in 26773 days" is noise, and dates that far out are real --
 * a placeholder due date is how you park an invoice that must never age into
 * OVERDUE.
 *
 * Overdue is deliberately NOT capped. A receivable is chased by its exact age,
 * and collapsing 400 days and 4000 into one phrase hides the difference that
 * matters most.
 */
const FUTURE_LABEL_CAP_DAYS = 365;

export function relativeDueLabel(dueDate: Date, today: Date = todayUtc()): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return "Due today";
  if (days > 0) {
    if (days === 1) return "Due tomorrow";
    if (days > FUTURE_LABEL_CAP_DAYS) return "Due in over a year";
    return `Due in ${days} days`;
  }
  const overdue = Math.abs(days);
  return overdue === 1 ? "1 day overdue" : `${overdue} days overdue`;
}

// --- Quarters ---------------------------------------------------------------
//
// BIR quarters follow the calendar year: Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep,
// Q4 Oct-Dec. Ranges here are half-open [start, end) so a payment dated the
// last day of a quarter lands in that quarter and not the next.

export interface Quarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export function quarterOf(value: Date): Quarter {
  const d = toUtcDate(value);
  return {
    year: d.getUTCFullYear(),
    quarter: (Math.floor(d.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  };
}

export function quarterRange(q: Quarter): { start: Date; end: Date } {
  const startMonth = (q.quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(q.year, startMonth, 1)),
    end: new Date(Date.UTC(q.year, startMonth + 3, 1)),
  };
}

export function formatQuarter(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

/** The current quarter and the seven before it, newest first, for a picker. */
export function recentQuarters(count = 8, now: Date = new Date()): Quarter[] {
  const current = quarterOf(now);
  const out: Quarter[] = [];
  let { year, quarter } = current;
  for (let i = 0; i < count; i++) {
    out.push({ year, quarter: quarter as 1 | 2 | 3 | 4 });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return out;
}

/** BIR quarterly income tax (1701Q) filing deadline, for a due-date hint. */
export function quarterFilingDeadline(q: Quarter): Date {
  // Q1 -> May 15 same year, Q2 -> Aug 15, Q3 -> Nov 15, Q4 -> Apr 15 next year.
  switch (q.quarter) {
    case 1:
      return new Date(Date.UTC(q.year, 4, 15));
    case 2:
      return new Date(Date.UTC(q.year, 7, 15));
    case 3:
      return new Date(Date.UTC(q.year, 10, 15));
    case 4:
      return new Date(Date.UTC(q.year + 1, 3, 15));
  }
}
