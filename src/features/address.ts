import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { regions } from '../backend/api';
import { MAPBOX_TOKEN } from './map/config';

export interface FoundAddress {
  line1: string;
  city: string;
  postcode: string;
  /** Country name as people write it ("United States"). */
  country: string;
  /** ISO code when known ("US"). */
  countryCode: string | null;
  lng: number;
  lat: number;
}

/** Asks for location permission (once) and returns the device position, or null. */
export async function currentPosition(): Promise<{ lng: number; lat: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lng: pos.coords.longitude, lat: pos.coords.latitude };
  } catch {
    return null;
  }
}

const nameFor = (code: string | null | undefined, fallback = '') => (code ? (regions.REGIONS.find((r) => r.code === code.toUpperCase())?.name ?? fallback) : fallback);

/**
 * The street address at a point: Apple/Google geocoder on the phone, Mapbox with a token,
 * otherwise OpenStreetMap (Photon). People can always correct it.
 */
export async function addressAt(p: { lng: number; lat: number }): Promise<FoundAddress | null> {
  if (Platform.OS !== 'web') {
    try {
      const [a] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
      if (a) {
        const line1 = [a.streetNumber, a.street].filter(Boolean).join(' ') || a.name || '';
        return { line1, city: a.city ?? a.subregion ?? '', postcode: a.postalCode ?? '', country: nameFor(a.isoCountryCode, a.country ?? ''), countryCode: a.isoCountryCode ?? null, ...p };
      }
    } catch {
      /* fall through to web services */
    }
  }
  try {
    if (MAPBOX_TOKEN.startsWith('pk.')) {
      type R = { features: { properties: { name: string; context?: { postcode?: { name: string }; place?: { name: string }; country?: { name: string; country_code: string } } } }[] };
      const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.lng}&latitude=${p.lat}&types=address&limit=1&access_token=${MAPBOX_TOKEN}`);
      const f = ((await res.json()) as R).features[0];
      if (f) {
        const c = f.properties.context ?? {};
        const code = c.country?.country_code?.toUpperCase() ?? null;
        return { line1: f.properties.name, city: c.place?.name ?? '', postcode: c.postcode?.name ?? '', country: nameFor(code, c.country?.name ?? ''), countryCode: code, ...p };
      }
    }
    type P = { features: { properties: { name?: string; housenumber?: string; street?: string; city?: string; town?: string; village?: string; postcode?: string; country?: string; countrycode?: string } }[] };
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${p.lng}&lat=${p.lat}&lang=en&limit=1`);
    const f = ((await res.json()) as P).features[0];
    if (!f) return null;
    const a = f.properties;
    const code = a.countrycode?.toUpperCase() ?? null;
    return { line1: [a.housenumber, a.street].filter(Boolean).join(' ') || a.name || '', city: a.city ?? a.town ?? a.village ?? '', postcode: a.postcode ?? '', country: nameFor(code, a.country ?? ''), countryCode: code, ...p };
  } catch {
    return null;
  }
}
