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
 * (free, no key, with Apple's routes and search); on the web MapLibre + MapTiler as fallback;
 * otherwise the built-in vector preview.
 */
export function mapProvider(platform: 'web' | 'ios' | 'android'): MapProvider {
  if (MAPBOX_TOKEN.startsWith('pk.')) return 'mapbox';
  if (platform === 'ios') return 'apple';
  if (platform === 'web' && MAPTILER_KEY) return 'maplibre';
  return 'preview';
}
