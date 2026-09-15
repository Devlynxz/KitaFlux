import { describe, expect, it } from "vitest";

import { convertPayment, effectiveRate, feeRatio, invertRate } from "../fx";

const base = {
  currency: "USD",
  homeCurrency: "PHP",
};

describe("convertPayment", () => {
  it("models the three different numbers the spec asks for", () => {
    // Invoiced $1,200. Wise takes $14.40. Rate on the day money landed: 57.85.
    const r = convertPayment({
      ...base,
      amountReceived: "1200.00",
      feeAmount: "14.40",
      fxRate: "57.85",
    });

    expect(r.gross.toString()).toBe("1200"); // what the platform sent
    expect(r.fee.toString()).toBe("14.4"); // what it kept
    expect(r.net.toString()).toBe("1185.6"); // what was converted
    // 1185.60 * 57.85 = 68,586.96
    expect(r.homeAmount.toString()).toBe("68586.96");
  });

  it("deducts the fee before converting, not after", () => {
    // Fee-then-convert is what Wise, Payoneer and PayPal actually do, and the
    // orderings genuinely disagree. Here they differ by a centavo:
    //   fee first:     round((100 - 50) * 57.8523)            = 2892.62
    //   convert first: round(100 * 57.8523) - round(50 * ...) = 2892.61
    // A cent per payment compounds across a quarter of them, and only one of
    // the two figures will match the bank statement.
    const feeFirst = convertPayment({
      ...base,
      amountReceived: "100.00",
      feeAmount: "50.00",
      fxRate: "57.8523",
    });
    expect(feeFirst.homeAmount.toString()).toBe("2892.62");
    expect(feeFirst.homeAmount.toString()).not.toBe("2892.61");
  });

  it("rounds the converted amount half up at 2dp", () => {
    // 100 * 57.855 = 5785.5 -> 5785.50 exactly; nudge to test the boundary.
    const r = convertPayment({
      ...base,
      amountReceived: "100.00",
      feeAmount: "0",
      fxRate: "57.8550000005",
    });
    expect(r.homeAmount.toString()).toBe("5785.5");
  });

  it("allows a zero fee", () => {
    const r = convertPayment({ ...base, amountReceived: "500", feeAmount: "0", fxRate: "58" });
    expect(r.net.toString()).toBe("500");
    expect(r.homeAmount.toString()).toBe("29000");
  });

  it("allows a fee equal to the whole amount", () => {
    const r = convertPayment({ ...base, amountReceived: "50", feeAmount: "50", fxRate: "58" });
    expect(r.net.toString()).toBe("0");
    expect(r.homeAmount.toString()).toBe("0");
  });

  it("rejects a fee larger than the amount received", () => {
    expect(() =>
      convertPayment({ ...base, amountReceived: "100", feeAmount: "150", fxRate: "58" }),
    ).toThrow(/fee cannot be larger/i);
  });

  it("rejects a negative fee", () => {
    expect(() =>
      convertPayment({ ...base, amountReceived: "100", feeAmount: "-5", fxRate: "58" }),
    ).toThrow(/negative/i);
  });

  it("rejects a zero or negative amount", () => {
    expect(() =>
      convertPayment({ ...base, amountReceived: "0", feeAmount: "0", fxRate: "58" }),
    ).toThrow(/greater than zero/i);
    expect(() =>
      convertPayment({ ...base, amountReceived: "-10", feeAmount: "0", fxRate: "58" }),
    ).toThrow(/greater than zero/i);
  });

  it("rejects a zero or negative rate", () => {
    expect(() =>
      convertPayment({ ...base, amountReceived: "100", feeAmount: "0", fxRate: "0" }),
    ).toThrow(/rate must be greater than zero/i);
  });

  it("passes same-currency payments through untouched", () => {
    const r = convertPayment({
      currency: "PHP",
      homeCurrency: "PHP",
      amountReceived: "5000.00",
      feeAmount: "25.00",
      fxRate: "1",
    });
    expect(r.homeAmount.toString()).toBe("4975");
  });

  it("refuses a same-currency payment at a rate that is not 1", () => {
    expect(() =>
      convertPayment({
        currency: "PHP",
        homeCurrency: "PHP",
        amountReceived: "5000",
        feeAmount: "0",
        fxRate: "57.85",
      }),
    ).toThrow(/must use a rate of 1/i);
  });

  it("never uses float arithmetic", () => {
    // 0.1 + 0.2 territory: 8.15 * 3 is 24.450000000000003 as a float.
    const r = convertPayment({
      ...base,
      amountReceived: "8.15",
      feeAmount: "0",
      fxRate: "3",
    });
    expect(r.homeAmount.toString()).toBe("24.45");
  });
});

describe("effectiveRate", () => {
  it("is worse than the headline rate once fees are counted", () => {
    const r = convertPayment({
      ...base,
      amountReceived: "1000",
      feeAmount: "20",
      fxRate: "58",
    });
    // 56840 / 1000 = 56.84, against a headline 58.
    expect(effectiveRate(r).toString()).toBe("56.84");
  });

  it("is zero rather than NaN when gross is zero", () => {
    expect(
      effectiveRate({ gross: convertPayment({ ...base, amountReceived: "1", feeAmount: "1", fxRate: "1" }).net, homeAmount: convertPayment({ ...base, amountReceived: "1", feeAmount: "1", fxRate: "1" }).homeAmount }).toString(),
    ).toBe("0");
  });
});

describe("feeRatio", () => {
  it("expresses the fee as a fraction of gross", () => {
    const r = convertPayment({ ...base, amountReceived: "1000", feeAmount: "25", fxRate: "58" });
    expect(feeRatio(r).toString()).toBe("0.025");
  });
});

describe("invertRate", () => {
  it("flips a pair", () => {
    expect(invertRate("2").toString()).toBe("0.5");
  });

  it("refuses to invert zero", () => {
    expect(() => invertRate("0")).toThrow();
  });
});
