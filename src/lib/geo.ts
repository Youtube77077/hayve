import AsyncStorage from '@react-native-async-storage/async-storage';
import { regions, session } from '../backend/api';

/**
 * Where is this device, and what are today's exchange rates? Runs once at start-up, in the
 * background, and caches the answer for a day:
 *  - country from the IP address (so a visitor from the UK sees pounds, the EU euros, Canada CA$…)
 *  - exchange rates from a public feed (prices are stored in US dollars and shown converted)
 * Both fall back silently (device language for the country, built-in rates) when offline.
 */
const KEY = 'hayve.geo.v1';
const DAY = 86_400_000;

async function getJson<T>(url: string, ms = 4000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** A country the visitor picked themselves (onboarding) beats the IP address and device language. */
let chosen: string | null = null;

/** Sets the visitor's country (currency, local supply, map centre) before they have an account. */
export function chooseCountry(code: string) {
  chosen = code;
  regions.setGuestCountry(code);
  session.refreshCurrency();
}

function apply(country: string | null, rates: Record<string, number> | null) {
  if (country && !chosen) regions.setGuestCountry(country);
  if (rates) regions.setRates(rates);
  session.refreshCurrency();
}

export async function detectCountryAndRates() {
  // Device language first (instant), then the cached or fresh network answer.
  apply(regions.regionFromLocale(Intl.DateTimeFormat().resolvedOptions().locale), null);
  try {
    const cached = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null') as { at: number; country: string | null; rates: Record<string, number> | null } | null;
    if (cached) apply(cached.country, cached.rates);
    if (cached && Date.now() - cached.at < DAY) return;
  } catch {
    /* ignore */
  }
  const [country, rates] = await Promise.all([
    getJson<{ country_code?: string }>('https://ipapi.co/json/')
      .then((j) => j.country_code?.toUpperCase() ?? null)
      .catch(() => null),
    getJson<{ result?: string; rates?: Record<string, number> }>('https://open.er-api.com/v6/latest/USD')
      .then((j) => (j.result === 'success' && j.rates ? j.rates : null))
      .catch(() => null),
  ]);
  apply(country, rates);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ at: Date.now(), country, rates }));
  } catch {
    /* ignore */
  }
}

/** Country for new accounts: detected from the IP address, else the device language. */
export const detectedCountry = () => regions.getGuestCountry();
