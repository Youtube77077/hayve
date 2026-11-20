/**
 * Countries Hayve serves and what is local in each: currency, payout account format, business IDs,
 * tax and a default city for maps. Hayve is US-first and international;
 * nothing here should assume one country.
 */

export type CurrencyCode = 'USD' | 'CAD' | 'GBP' | 'EUR' | 'AUD';

export interface Region {
  code: string;
  name: string;
  currency: CurrencyCode;
  /** Payout account fields for withdrawals (collected and verified by the payment provider). */
  account: { label: string; placeholder: string; routingLabel?: string; routingPlaceholder?: string };
  postcodeLabel: string;
  stateLabel?: string;
  /** Business registration and tax IDs. */
  businessId: { label: string; placeholder: string; pattern: RegExp; hint: string };
  taxId: { label: string; placeholder: string; optional: boolean };
  /** Standard VAT/GST on invoices (0 where sales tax depends on the state). */
  taxRate: number;
  taxName: string;
  /** Map fallback when the device location is unknown. */
  city: { name: string; lng: number; lat: number };
  dataAuthority: string;
}


export const REGIONS: Region[] = [
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    account: { label: 'Account number', placeholder: '000123456789', routingLabel: 'Routing number', routingPlaceholder: '110000000' },
    postcodeLabel: 'ZIP code',
    stateLabel: 'State',
    businessId: { label: 'EIN', placeholder: '12-3456789', pattern: /^\d{2}-?\d{7}$/, hint: 'Your 9-digit Employer Identification Number' },
    taxId: { label: 'Sales tax permit (optional)', placeholder: '', optional: true },
    taxRate: 0,
    taxName: 'Sales tax',
    city: { name: 'New York', lng: -73.9857, lat: 40.7484 },
    dataAuthority: 'your state attorney general or the FTC',
  },
  {
    code: 'CA',
    name: 'Canada',
    currency: 'CAD',
    account: { label: 'Account number', placeholder: '1234567', routingLabel: 'Transit + institution number', routingPlaceholder: '12345-001' },
    postcodeLabel: 'Postal code',
    stateLabel: 'Province',
    businessId: { label: 'Business number (BN)', placeholder: '123456789', pattern: /^\d{9}$/, hint: 'Your 9-digit CRA business number' },
    taxId: { label: 'GST/HST number (optional)', placeholder: '123456789RT0001', optional: true },
    taxRate: 0.05,
    taxName: 'GST',
    city: { name: 'Toronto', lng: -79.3832, lat: 43.6532 },
    dataAuthority: 'the Office of the Privacy Commissioner of Canada',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    account: { label: 'Account number', placeholder: '12345678', routingLabel: 'Sort code', routingPlaceholder: '12-34-56' },
    postcodeLabel: 'Postcode',
    businessId: { label: 'Company number', placeholder: '01234567', pattern: /^[A-Z0-9]{8}$/i, hint: 'Your Companies House number (8 characters)' },
    taxId: { label: 'VAT number (optional)', placeholder: 'GB123456789', optional: true },
    taxRate: 0.2,
    taxName: 'VAT',
    city: { name: 'London', lng: -0.1276, lat: 51.5072 },
    dataAuthority: 'the Information Commissioner’s Office (ICO)',
  },
  {
    code: 'IE',
    name: 'Ireland',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'IE29 AIBK 9311 5212 3456 78' },
    postcodeLabel: 'Eircode',
    businessId: { label: 'CRO number', placeholder: '123456', pattern: /^\d{4,8}$/, hint: 'Your Companies Registration Office number' },
    taxId: { label: 'VAT number (optional)', placeholder: 'IE1234567T', optional: true },
    taxRate: 0.23,
    taxName: 'VAT',
    city: { name: 'Dublin', lng: -6.2603, lat: 53.3498 },
    dataAuthority: 'the Data Protection Commission',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'NL91 ABNA 0417 1643 00' },
    postcodeLabel: 'Postcode',
    businessId: { label: 'KVK number', placeholder: '12345678', pattern: /^\d{8}$/, hint: 'Your 8-digit Chamber of Commerce number' },
    taxId: { label: 'VAT number', placeholder: 'NL123456789B01', optional: true },
    taxRate: 0.21,
    taxName: 'VAT',
    city: { name: 'Amsterdam', lng: 4.8952, lat: 52.3702 },
    dataAuthority: 'the Autoriteit Persoonsgegevens',
  },
  {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'DE89 3704 0044 0532 0130 00' },
    postcodeLabel: 'Postleitzahl',
    businessId: { label: 'Handelsregister number', placeholder: 'HRB 12345', pattern: /^[A-Z]{2,3}\s?\d{3,7}$/i, hint: 'From the commercial register' },
    taxId: { label: 'VAT number (USt-IdNr., optional)', placeholder: 'DE123456789', optional: true },
    taxRate: 0.19,
    taxName: 'VAT',
    city: { name: 'Berlin', lng: 13.405, lat: 52.52 },
    dataAuthority: 'your state data protection authority',
  },
  {
    code: 'FR',
    name: 'France',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'FR76 3000 6000 0112 3456 7890 189' },
    postcodeLabel: 'Code postal',
    businessId: { label: 'SIREN', placeholder: '123456789', pattern: /^\d{9}$/, hint: 'Your 9-digit SIREN number' },
    taxId: { label: 'VAT number (optional)', placeholder: 'FR12345678901', optional: true },
    taxRate: 0.2,
    taxName: 'VAT',
    city: { name: 'Paris', lng: 2.3522, lat: 48.8566 },
    dataAuthority: 'the CNIL',
  },
  {
    code: 'BE',
    name: 'Belgium',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'BE68 5390 0754 7034' },
    postcodeLabel: 'Postcode',
    businessId: { label: 'Enterprise number', placeholder: '0123.456.789', pattern: /^\d{4}\.?\d{3}\.?\d{3}$/, hint: 'Your KBO/BCE number' },
    taxId: { label: 'VAT number (optional)', placeholder: 'BE0123456789', optional: true },
    taxRate: 0.21,
    taxName: 'VAT',
    city: { name: 'Brussels', lng: 4.3517, lat: 50.8503 },
    dataAuthority: 'the Data Protection Authority',
  },
  {
    code: 'ES',
    name: 'Spain',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'ES91 2100 0418 4502 0005 1332' },
    postcodeLabel: 'Código postal',
    businessId: { label: 'NIF/CIF', placeholder: 'B12345678', pattern: /^[A-Z0-9]{9}$/i, hint: 'Your tax identification number' },
    taxId: { label: 'VAT number (optional)', placeholder: 'ESB12345678', optional: true },
    taxRate: 0.21,
    taxName: 'VAT',
    city: { name: 'Madrid', lng: -3.7038, lat: 40.4168 },
    dataAuthority: 'the AEPD',
  },
  {
    code: 'IT',
    name: 'Italy',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'IT60 X054 2811 1010 0000 0123 456' },
    postcodeLabel: 'CAP',
    businessId: { label: 'Partita IVA', placeholder: '12345678901', pattern: /^\d{11}$/, hint: 'Your 11-digit VAT/company number' },
    taxId: { label: 'VAT number (optional)', placeholder: 'IT12345678901', optional: true },
    taxRate: 0.22,
    taxName: 'VAT',
    city: { name: 'Rome', lng: 12.4964, lat: 41.9028 },
    dataAuthority: 'the Garante per la protezione dei dati personali',
  },
  {
    code: 'PT',
    name: 'Portugal',
    currency: 'EUR',
    account: { label: 'IBAN', placeholder: 'PT50 0002 0123 1234 5678 9015 4' },
    postcodeLabel: 'Código postal',
    businessId: { label: 'NIPC', placeholder: '501234567', pattern: /^\d{9}$/, hint: 'Your 9-digit company tax number' },
    taxId: { label: 'VAT number (optional)', placeholder: 'PT501234567', optional: true },
    taxRate: 0.23,
    taxName: 'VAT',
    city: { name: 'Lisbon', lng: -9.1393, lat: 38.7223 },
    dataAuthority: 'the CNPD',
  },
  {
    code: 'AU',
    name: 'Australia',
    currency: 'AUD',
    account: { label: 'Account number', placeholder: '123456789', routingLabel: 'BSB', routingPlaceholder: '062-000' },
    postcodeLabel: 'Postcode',
    stateLabel: 'State',
    businessId: { label: 'ABN', placeholder: '12 345 678 901', pattern: /^(\d\s?){11}$/, hint: 'Your 11-digit Australian Business Number' },
    taxId: { label: 'GST registered? (optional)', placeholder: '', optional: true },
    taxRate: 0.1,
    taxName: 'GST',
    city: { name: 'Sydney', lng: 151.2093, lat: -33.8688 },
    dataAuthority: 'the OAIC',
  },
];

export const DEFAULT_REGION = 'US';

export function region(code?: string | null): Region {
  return REGIONS.find((r) => r.code === code) ?? REGIONS[0];
}

/** Best guess from a device locale like "en-GB" or "nl_NL"; falls back to the United States. */
export function regionFromLocale(locale?: string | null) {
  const cc = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  return REGIONS.some((r) => r.code === cc) ? cc! : DEFAULT_REGION;
}

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { USD: '$', CAD: 'CA$', GBP: '£', EUR: '€', AUD: 'A$' };

/** Formats integer cents in a currency, e.g. $1,234.56 / £12.00 / €8.50. */
export function formatMoney(cents: number, currency: CurrencyCode = 'USD', opts: { sign?: boolean; compact?: boolean } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  let body: string;
  if (opts.compact && abs >= 1000) body = `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  else body = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = neg ? '−' : opts.sign ? '+' : '';
  return `${sign}${CURRENCY_SYMBOL[currency]}${body}`;
}

/* ------------------------------------------------------------- FX ---- */

/**
 * All amounts are stored as integer cents in one base currency (US dollars) so prices and
 * balances mean the same thing for everyone. Each person sees them converted to their own
 * currency, and amounts they type are converted back. Rates are refreshed from a public FX feed
 * at start-up (see src/lib/geo.ts) with these as the offline fallback.
 */
export const BASE_CURRENCY: CurrencyCode = 'USD';
export const DEFAULT_RATES: Record<CurrencyCode, number> = { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.38, AUD: 1.53 };
let rates: Record<CurrencyCode, number> = { ...DEFAULT_RATES };

export function setRates(next: Partial<Record<CurrencyCode, number>>) {
  for (const [k, v] of Object.entries(next)) if (k in rates && typeof v === 'number' && v > 0 && Number.isFinite(v)) rates[k as CurrencyCode] = v;
}

export function getRates() {
  return { ...rates };
}

/** Converts integer cents between currencies at the current rate. */
export function convert(cents: number, from: CurrencyCode, to: CurrencyCode) {
  if (from === to) return cents;
  return Math.round((cents / rates[from]) * rates[to]);
}

/* The display currency follows the signed-in person's country (or, signed out, where they are). */
let displayCurrency: CurrencyCode = 'USD';

/** Base cents → cents in the person's currency. */
export const toDisplay = (baseCents: number) => convert(baseCents, BASE_CURRENCY, displayCurrency);
/** Cents typed in the person's currency → base cents. */
export const fromDisplay = (displayCents: number) => convert(displayCents, displayCurrency, BASE_CURRENCY);

/** Country detected for this device (from the IP address or location) before anyone signs in. */
let guestCountry = DEFAULT_REGION;

export function setGuestCountry(code: string) {
  if (REGIONS.some((r) => r.code === code)) guestCountry = code;
}

export function getGuestCountry() {
  return guestCountry;
}

export function setDisplayCurrency(c: CurrencyCode) {
  displayCurrency = c;
}

export function getDisplayCurrency() {
  return displayCurrency;
}

/** Formats base cents in the signed-in person's currency (used in messages and errors). */
export function fmtMoney(cents: number, opts: { sign?: boolean; compact?: boolean } = {}) {
  return formatMoney(toDisplay(cents), displayCurrency, opts);
}
