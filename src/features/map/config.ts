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

export type MapProvider = 'mapbox' | 'maplibre' | 'preview';

/** Which renderer to use on this platform. `preview` is the built-in vector preview used when no key is configured. */
export function mapProvider(platform: 'web' | 'native'): MapProvider {
  if (MAPBOX_TOKEN.startsWith('pk.')) return 'mapbox';
  if (platform === 'web' && MAPTILER_KEY) return 'maplibre';
  return 'preview';
}
