import { describe, expect, it } from "vitest";

import {
  Decimal,
  formatMoney,
  invoiceTotals,
  lineAmount,
  round,
  scaleFor,
  sum,
  toDecimal,
  toStorage,
} from "../money";

describe("toDecimal", () => {
  it("keeps precision that a float would lose", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float space.
    expect(toDecimal("0.1").plus(toDecimal("0.2")).toString()).toBe("0.3");
  });

  it("accepts the thousands separators people paste out of spreadsheets", () => {
    expect(toDecimal("1,234.56").toString()).toBe("1234.56");
  });

  it("treats blank as zero, because an empty optional money field means zero", () => {
    expect(toDecimal("").toString()).toBe("0");
    expect(toDecimal(null).toString()).toBe("0");
    expect(toDecimal(undefined).toString()).toBe("0");
  });

  it("throws on garbage instead of producing NaN", () => {
    expect(() => toDecimal("abc")).toThrow(/not a valid amount/i);
    expect(() => toDecimal("12.3.4")).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => toDecimal("Infinity")).toThrow(/finite/i);
  });
});

describe("round", () => {
  it("rounds half away from zero, not to even", () => {
    // Banker's rounding would give 2.34 here. BIR practice gives 2.35.
    expect(round("2.345", "USD").toString()).toBe("2.35");
    expect(round("2.355", "USD").toString()).toBe("2.36");
    // The classic banker's-rounding divergence point.
    expect(round("0.125", "USD").toString()).toBe("0.13");
    expect(round("0.135", "USD").toString()).toBe("0.14");
  });

  it("rounds negatives away from zero too", () => {
    expect(round("-2.345", "USD").toString()).toBe("-2.35");
  });

  it("uses the currency scale", () => {
    expect(scaleFor("USD")).toBe(2);
    expect(scaleFor("JPY")).toBe(0);
    expect(round("1234.56", "JPY").toString()).toBe("1235");
  });

  it("defaults unknown currencies to 2dp rather than throwing", () => {
    expect(scaleFor("XYZ")).toBe(2);
  });
});

describe("lineAmount", () => {
  it("rounds the product of quantity and unit price", () => {
    expect(lineAmount("3", "1200.00", "USD").toString()).toBe("3600");
  });

  it("handles fractional hours without drift", () => {
    // 7.25 hours at 82.50/hr = 598.125 -> 598.13
    expect(lineAmount("7.25", "82.50", "USD").toString()).toBe("598.13");
  });
});

describe("invoiceTotals", () => {
  it("sums rounded lines, so the total matches the visible column", () => {
    // Each line rounds up a half-cent. Rounding once at the end would give
    // 30.02; rounding per line and summing gives 30.03, which is what the
    // client sees when they add the column themselves.
    const lines = [
      { quantity: "1", unitPrice: "10.005" },
      { quantity: "1", unitPrice: "10.005" },
      { quantity: "1", unitPrice: "10.005" },
    ];
    const { subtotal } = invoiceTotals(lines, "0", "USD");
    expect(subtotal.toString()).toBe("30.03");
  });

  it("applies tax to the subtotal as a whole", () => {
    const lines = [{ quantity: "10", unitPrice: "100.00" }];
    const t = invoiceTotals(lines, "0.12", "PHP");
    expect(t.subtotal.toString()).toBe("1000");
    expect(t.taxAmount.toString()).toBe("120");
    expect(t.total.toString()).toBe("1120");
  });

  it("rounds tax half up", () => {
    // 1000.05 * 0.12 = 120.006 -> 120.01
    const t = invoiceTotals([{ quantity: "1", unitPrice: "1000.05" }], "0.12", "USD");
    expect(t.taxAmount.toString()).toBe("120.01");
    expect(t.total.toString()).toBe("1120.06");
  });

  it("is zero for an invoice with no lines", () => {
    const t = invoiceTotals([], "0.12", "USD");
    expect(t.subtotal.toString()).toBe("0");
    expect(t.total.toString()).toBe("0");
  });

  it("does not accumulate error over many lines", () => {
    const lines = Array.from({ length: 500 }, () => ({ quantity: "1", unitPrice: "0.01" }));
    expect(invoiceTotals(lines, "0", "USD").subtotal.toString()).toBe("5");
  });
});

describe("sum", () => {
  it("starts at zero", () => {
    expect(sum([]).toString()).toBe("0");
  });

  it("adds without float drift", () => {
    const values = Array.from({ length: 10 }, () => "0.1");
    expect(sum(values).toString()).toBe("1");
  });
});

describe("toStorage", () => {
  it("always writes the full scale, so the column never truncates", () => {
    expect(toStorage("5", "USD")).toBe("5.00");
    expect(toStorage("5.1", "USD")).toBe("5.10");
  });

  it("never emits exponent notation for large amounts", () => {
    expect(toStorage("1000000000", "PHP")).toBe("1000000000.00");
  });
});

describe("formatMoney", () => {
  it("groups thousands and keeps the scale", () => {
    expect(formatMoney("1234567.5", "PHP")).toBe("₱1,234,567.50");
    expect(formatMoney("1200", "USD")).toBe("$1,200.00");
  });

  it("puts the minus outside the symbol", () => {
    expect(formatMoney("-450.25", "USD")).toBe("-$450.25");
  });

  it("can append the ISO code, which matters when currencies share a screen", () => {
    expect(formatMoney("1200", "USD", { withCode: true })).toBe("$1,200.00 USD");
  });

  it("handles amounts under 1000 without a stray separator", () => {
    expect(formatMoney("999.99", "USD")).toBe("$999.99");
  });

  it("accepts a Decimal directly", () => {
    expect(formatMoney(new Decimal("42.5"), "USD")).toBe("$42.50");
  });
});
