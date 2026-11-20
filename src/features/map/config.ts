/**
 * Map configuration. Keys come only from environment variables (EXPO_PUBLIC_* are
 * inlined at build time, so use a public, URL-restricted Mapbox token — never a secret one).
 *
 *   EXPO_PUBLIC_MAPBOX_TOKEN      pk.… public token (web + iOS + Android)
 *   EXPO_PUBLIC_MAPBOX_STYLE_URL  optional mapbox://styles/<user>/<id> published from Studio
 *   EXPO_PUBLIC_MAPTILER_KEY      optional fallback (MapLibre + MapTiler, web)
 */
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
export const MAPBOX_STYLE_URL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? '';
export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

export type MapProvider = 'mapbox' | 'maplibre' | 'apple' | 'preview';

/**
 * Which renderer to use. Mapbox when a token is set; on iPhone/iPad without a token, Apple Maps
 * (free, no key, with Apple's routes and search); on the web MapLibre with OpenStreetMap tiles
 * (OpenFreeMap, free, no key; MapTiler with a key); the vector preview only on Android without a key.
 */
export function mapProvider(platform: 'web' | 'ios' | 'android'): MapProvider {
  if (MAPBOX_TOKEN.startsWith('pk.')) return 'mapbox';
  if (platform === 'ios') return 'apple';
  // The web always shows a real map: MapLibre with OpenFreeMap tiles (free, no key) or MapTiler.
  if (platform === 'web') return 'maplibre';
  return 'preview';
}

/** Free OpenStreetMap vector style (OpenFreeMap "Positron": light grey, fits the Hayve look). */
export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
