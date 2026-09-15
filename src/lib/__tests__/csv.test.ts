import { describe, expect, it } from "vitest";

import { csvCell, textCell } from "../csv";

/**
 * The quarterly CSV is opened in Excel or Sheets by an accountant. Free text a
 * user typed -- a client name, a payment reference -- must never be evaluated
 * there as a formula.
 */
describe("CSV cells", () => {
  it("neutralises text that a spreadsheet would run as a formula", () => {
    expect(textCell('=HYPERLINK("http://evil.test","Click")')).toBe(
      `"'=HYPERLINK(""http://evil.test"",""Click"")"`,
    );
    expect(textCell("+639171234567")).toBe("'+639171234567");
    expect(textCell("-2+3")).toBe("'-2+3");
    expect(textCell("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
  });

  it("leaves ordinary text alone", () => {
    expect(textCell("Acme Inc.")).toBe("Acme Inc.");
    expect(textCell("")).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Reyes, Jordan")).toBe('"Reyes, Jordan"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("keeps amounts numeric", () => {
    expect(csvCell("-14.40")).toBe("-14.40");
  });
});
