/**
 * Escape a CSV field: quote it, and double any quotes inside.
 *
 * Free text goes through `textCell`, which prefixes an apostrophe to anything
 * starting with = + - @ (or a tab/CR). This file is opened in Excel or Sheets by
 * an accountant, and a client name or payment reference typed as
 * `=HYPERLINK(...)` would otherwise run as a formula on their machine. Amounts
 * do not go through it: they must stay numeric.
 */
export function textCell(value: string): string {
  return csvCell(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
}

export function csvCell(value: string): string {
  const needsQuoting = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}
