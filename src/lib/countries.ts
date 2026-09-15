/**
 * Countries offered in the client and settings forms.
 *
 * Not an exhaustive ISO list -- the markets Filipino freelancers actually bill,
 * plus PH itself, with an "Other" escape hatch. A 250-entry dropdown is worse
 * for the common case, and the field is only used for display on the invoice
 * and grouping in reports.
 */
export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "PH", name: "Philippines" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "JP", name: "Japan" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "IE", name: "Ireland" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "IN", name: "India" },
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
  { code: "ZZ", name: "Other" },
];

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}

/** A sensible default billing currency for a country, used to prefill forms. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  PH: "PHP",
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "AUD",
  SG: "SGD",
  DE: "EUR",
  NL: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  IE: "EUR",
};
