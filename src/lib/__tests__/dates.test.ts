import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  formatDate,
  parseDateInput,
  quarterFilingDeadline,
  quarterOf,
  quarterRange,
  recentQuarters,
  relativeDueLabel,
  toDateInputValue,
  toUtcDate,
} from "../dates";

describe("parseDateInput", () => {
  it("parses a date input value as UTC midnight", () => {
    const d = parseDateInput("2026-03-05");
    expect(d.toISOString()).toBe("2026-03-05T00:00:00.000Z");
  });

  it("throws on nonsense rather than producing an Invalid Date", () => {
    expect(() => parseDateInput("not-a-date")).toThrow();
    expect(() => parseDateInput("05/03/2026")).toThrow();
  });
});

describe("toUtcDate", () => {
  it("keeps a Manila-evening timestamp on the same calendar day", () => {
    // 2026-03-05 23:30 in UTC+8 is 15:30 UTC the same day. Naive local-date
    // handling in the other direction is what produces off-by-one payment dates.
    const instant = new Date("2026-03-05T15:30:00.000Z");
    expect(toUtcDate(instant).toISOString()).toBe("2026-03-05T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const once = toUtcDate(new Date("2026-03-05T15:30:00Z"));
    expect(toUtcDate(once).getTime()).toBe(once.getTime());
  });
});

describe("toDateInputValue", () => {
  it("round-trips with parseDateInput", () => {
    expect(toDateInputValue(parseDateInput("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("addDays / daysBetween", () => {
  it("adds across a month boundary", () => {
    expect(toDateInputValue(addDays(parseDateInput("2026-01-28"), 5))).toBe("2026-02-02");
  });

  it("adds across a leap day", () => {
    expect(toDateInputValue(addDays(parseDateInput("2028-02-28"), 1))).toBe("2028-02-29");
  });

  it("counts whole days, signed", () => {
    expect(daysBetween(parseDateInput("2026-03-01"), parseDateInput("2026-03-15"))).toBe(14);
    expect(daysBetween(parseDateInput("2026-03-15"), parseDateInput("2026-03-01"))).toBe(-14);
  });

  it("is unaffected by a DST transition in the host timezone", () => {
    // 30 real days regardless of what the local clock did in between.
    expect(daysBetween(parseDateInput("2026-03-01"), parseDateInput("2026-03-31"))).toBe(30);
  });
});

describe("relativeDueLabel", () => {
  const today = parseDateInput("2026-03-10");

  it("says due today on the due date", () => {
    expect(relativeDueLabel(parseDateInput("2026-03-10"), today)).toBe("Due today");
  });

  it("counts days remaining", () => {
    expect(relativeDueLabel(parseDateInput("2026-03-11"), today)).toBe("Due tomorrow");
    expect(relativeDueLabel(parseDateInput("2026-03-24"), today)).toBe("Due in 14 days");
  });

  it("counts days overdue", () => {
    expect(relativeDueLabel(parseDateInput("2026-03-09"), today)).toBe("1 day overdue");
    expect(relativeDueLabel(parseDateInput("2026-02-24"), today)).toBe("14 days overdue");
  });

  it("stops counting future days past a year", () => {
    // 365 is still a day count someone can act on; beyond that the exact
    // number stops meaning anything ("Due in 26773 days" is noise, not data).
    expect(relativeDueLabel(parseDateInput("2027-03-10"), today)).toBe("Due in 365 days");
    expect(relativeDueLabel(parseDateInput("2027-03-11"), today)).toBe("Due in over a year");
    expect(relativeDueLabel(parseDateInput("2099-12-31"), today)).toBe("Due in over a year");
  });

  it("keeps overdue counts exact however old they get", () => {
    // Deliberately not capped: an ageing receivable is chased by its exact
    // age, and "over a year overdue" would hide the difference between 400
    // days and 4000.
    expect(relativeDueLabel(parseDateInput("2025-03-10"), today)).toBe("365 days overdue");
    expect(relativeDueLabel(parseDateInput("2024-03-10"), today)).toBe("730 days overdue");
  });
});

describe("quarters", () => {
  it("maps months to BIR calendar quarters", () => {
    expect(quarterOf(parseDateInput("2026-01-01"))).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf(parseDateInput("2026-03-31"))).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf(parseDateInput("2026-04-01"))).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf(parseDateInput("2026-12-31"))).toEqual({ year: 2026, quarter: 4 });
  });

  it("produces half-open ranges so the last day lands in its own quarter", () => {
    const { start, end } = quarterRange({ year: 2026, quarter: 1 });
    expect(toDateInputValue(start)).toBe("2026-01-01");
    expect(toDateInputValue(end)).toBe("2026-04-01");

    const lastDay = parseDateInput("2026-03-31");
    expect(lastDay.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(lastDay.getTime()).toBeLessThan(end.getTime());
  });

  it("wraps Q4 into the next year", () => {
    const { end } = quarterRange({ year: 2026, quarter: 4 });
    expect(toDateInputValue(end)).toBe("2027-01-01");
  });

  it("walks backwards across the year boundary", () => {
    const qs = recentQuarters(5, parseDateInput("2026-02-15"));
    expect(qs).toEqual([
      { year: 2026, quarter: 1 },
      { year: 2025, quarter: 4 },
      { year: 2025, quarter: 3 },
      { year: 2025, quarter: 2 },
      { year: 2025, quarter: 1 },
    ]);
  });

  it("puts the Q4 filing deadline in the following April", () => {
    expect(toDateInputValue(quarterFilingDeadline({ year: 2026, quarter: 4 }))).toBe("2027-04-15");
    expect(toDateInputValue(quarterFilingDeadline({ year: 2026, quarter: 1 }))).toBe("2026-05-15");
  });
});

describe("formatDate", () => {
  it("is locale-independent and unambiguous", () => {
    expect(formatDate(parseDateInput("2026-03-05"))).toBe("05 Mar 2026");
  });
});
