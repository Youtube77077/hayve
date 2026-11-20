/**
 * Countries Hayve serves and what is local in each: currency, how people pay by bank, the banks
 * they use, business IDs, tax and a default city for maps. Hayve is US-first and international;
 * nothing here should assume one country.
 */

export type CurrencyCode = 'USD' | 'CAD' | 'GBP' | 'EUR' | 'AUD';

export type BankRail =
  | 'ach' // United States: bank account (ACH), connected by logging in to the bank or with routing + account number
  | 'eft' // Canada: pre-authorised debit / Interac
  | 'faster_payments' // United Kingdom: pay by bank (Open Banking), Faster Payments, Direct Debit
  | 'sepa' // Euro area: pay by bank (Open Banking) or SEPA Direct Debit
  | 'ideal_wero' // Netherlands: iDEAL | Wero
  | 'wero' // Germany, France, Belgium: Wero / pay by bank
  | 'becs'; // Australia: PayTo / BECS Direct Debit

export interface Region {
  code: string;
  name: string;
  currency: CurrencyCode;
  /** Pay by bank as people in this country know it. */
  bankRail: BankRail;
  bankRailName: string;
  /** Manual connection fields. */
  account: { label: string; placeholder: string; routingLabel?: string; routingPlaceholder?: string; mandate: string };
  banks: string[];
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

const EU_BANKS_DEFAULT = ['Revolut', 'N26', 'Wise', 'bunq'];

export const REGIONS: Region[] = [
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    bankRail: 'ach',
    bankRailName: 'Bank account (ACH)',
    account: { label: 'Account number', placeholder: '000123456789', routingLabel: 'Routing number', routingPlaceholder: '110000000', mandate: 'You authorize Hayve’s payment partner to debit this account for payments you approve (ACH).' },
    banks: ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'Capital One', 'U.S. Bank', 'PNC', 'TD Bank', 'Truist', 'Chime', 'Ally', 'Navy Federal'],
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
    bankRail: 'eft',
    bankRailName: 'Bank account (pre-authorized debit)',
    account: { label: 'Account number', placeholder: '1234567', routingLabel: 'Transit + institution number', routingPlaceholder: '12345-001', mandate: 'You authorize a pre-authorized debit (PAD) for payments you approve.' },
    banks: ['RBC', 'TD', 'Scotiabank', 'BMO', 'CIBC', 'National Bank', 'Desjardins', 'Tangerine', 'Simplii'],
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
    bankRail: 'faster_payments',
    bankRailName: 'Pay by bank',
    account: { label: 'Account number', placeholder: '12345678', routingLabel: 'Sort code', routingPlaceholder: '12-34-56', mandate: 'You set up a Direct Debit with Hayve’s payment partner for payments you approve.' },
    banks: ['Barclays', 'HSBC', 'Lloyds', 'NatWest', 'Santander', 'Nationwide', 'Halifax', 'Monzo', 'Starling', 'Revolut', 'TSB', 'Metro Bank'],
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
    bankRail: 'sepa',
    bankRailName: 'Pay by bank',
    account: { label: 'IBAN', placeholder: 'IE29 AIBK 9311 5212 3456 78', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['AIB', 'Bank of Ireland', 'PTSB', 'Revolut', 'N26', 'An Post Money', 'bunq'],
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
    bankRail: 'ideal_wero',
    bankRailName: 'iDEAL | Wero',
    account: { label: 'IBAN', placeholder: 'NL91 ABNA 0417 1643 00', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['ING', 'ABN AMRO', 'Rabobank', 'bunq', 'ASN Bank', 'Knab', 'SNS', 'Triodos Bank', ...EU_BANKS_DEFAULT.filter((b) => b !== 'bunq')],
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
    bankRail: 'wero',
    bankRailName: 'Wero / pay by bank',
    account: { label: 'IBAN', placeholder: 'DE89 3704 0044 0532 0130 00', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['Sparkasse', 'Deutsche Bank', 'Commerzbank', 'Volksbank', 'ING', 'DKB', 'Postbank', ...EU_BANKS_DEFAULT],
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
    bankRail: 'wero',
    bankRailName: 'Wero / pay by bank',
    account: { label: 'IBAN', placeholder: 'FR76 3000 6000 0112 3456 7890 189', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['BNP Paribas', 'Crédit Agricole', 'Société Générale', 'La Banque Postale', 'LCL', 'Caisse d’Epargne', 'Boursorama', ...EU_BANKS_DEFAULT],
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
    bankRail: 'wero',
    bankRailName: 'Wero / Bancontact',
    account: { label: 'IBAN', placeholder: 'BE68 5390 0754 7034', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['KBC', 'BNP Paribas Fortis', 'Belfius', 'ING', 'Argenta', ...EU_BANKS_DEFAULT],
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
    bankRail: 'sepa',
    bankRailName: 'Pay by bank',
    account: { label: 'IBAN', placeholder: 'ES91 2100 0418 4502 0005 1332', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['Santander', 'BBVA', 'CaixaBank', 'Sabadell', 'Bankinter', 'Unicaja', ...EU_BANKS_DEFAULT],
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
    bankRail: 'sepa',
    bankRailName: 'Pay by bank',
    account: { label: 'IBAN', placeholder: 'IT60 X054 2811 1010 0000 0123 456', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['Intesa Sanpaolo', 'UniCredit', 'BPER', 'Banco BPM', 'Fineco', 'Poste Italiane', ...EU_BANKS_DEFAULT],
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
    bankRail: 'sepa',
    bankRailName: 'Pay by bank',
    account: { label: 'IBAN', placeholder: 'PT50 0002 0123 1234 5678 9015 4', mandate: 'You sign a SEPA Direct Debit mandate for payments you approve.' },
    banks: ['Caixa Geral de Depósitos', 'Millennium bcp', 'Novo Banco', 'Santander', 'BPI', ...EU_BANKS_DEFAULT],
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
    bankRail: 'becs',
    bankRailName: 'Bank account (PayTo)',
    account: { label: 'Account number', placeholder: '123456789', routingLabel: 'BSB', routingPlaceholder: '062-000', mandate: 'You authorize a PayTo agreement / BECS Direct Debit for payments you approve.' },
    banks: ['Commonwealth Bank', 'Westpac', 'ANZ', 'NAB', 'Macquarie', 'ING', 'Bendigo Bank', 'Up'],
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
