import type { Place } from './types';

/** Saved and popular places in Amsterdam (real coordinates, WGS84). */
export const PLACES: Place[] = [
  { id: 'centraal', name: 'Amsterdam Centraal', address: 'Stationsplein, 1012 AB', lng: 4.9003, lat: 52.3791 },
  { id: 'dam', name: 'Dam Square', address: 'Dam, 1012 JS', lng: 4.8936, lat: 52.3731 },
  { id: 'rijks', name: 'Rijksmuseum', address: 'Museumstraat 1, 1071 XX', lng: 4.8852, lat: 52.36 },
  { id: 'vondel', name: 'Vondelpark', address: 'Vondelpark, 1071 AA', lng: 4.8686, lat: 52.358 },
  { id: 'pijp', name: 'De Pijp', address: 'Albert Cuypstraat, 1072 CT', lng: 4.8936, lat: 52.3556 },
  { id: 'jordaan', name: 'Jordaan', address: 'Westerstraat 120, 1015 MN', lng: 4.881, lat: 52.378 },
  { id: 'zuid', name: 'Amsterdam Zuid', address: 'Zuidplein, 1077 XV', lng: 4.8721, lat: 52.3389 },
  { id: 'ndsm', name: 'NDSM Wharf', address: 'NDSM-Plein 28, 1033 WB', lng: 4.895, lat: 52.4011 },
  { id: 'amstel', name: 'Amstel Station', address: 'Julianaplein 1, 1097 DN', lng: 4.9178, lat: 52.3466 },
  { id: 'westerpark', name: 'Westerpark', address: 'Haarlemmerweg 8, 1014 BE', lng: 4.879, lat: 52.3858 },
  { id: 'noord', name: 'Buiksloterweg', address: 'Buiksloterweg 5, 1031 CC', lng: 4.902, lat: 52.3836 },
  { id: 'oost', name: 'Oosterpark', address: "s-Gravesandestraat, 1092 AA", lng: 4.92, lat: 52.36 },
  { id: 'schiphol', name: 'Schiphol Airport', address: 'Evert van de Beekstraat 202', lng: 4.7639, lat: 52.3105 },
  { id: 'home', name: 'Home', address: 'Cornelis Dirkszoonlaan 51', lng: 4.933, lat: 52.362 },
  { id: 'work', name: 'Studio', address: 'Reijnier Vinkeleskade 62', lng: 4.879, lat: 52.35 },
];

/** Pickup points for Drive and other location-based listings. */
export const PICKUP_POINTS: { label: string; placeId: string }[] = [
  { label: 'Amsterdam Centraal', placeId: 'centraal' },
  { label: 'Amsterdam Zuid', placeId: 'zuid' },
  { label: 'Amsterdam Oost', placeId: 'oost' },
  { label: 'Amsterdam Noord', placeId: 'noord' },
  { label: 'Schiphol Airport', placeId: 'schiphol' },
];

/** Approximate coordinates for a listing's location text, spread a little per listing so pins don't stack. */
export function locationCoord(location: string, seed: string): { lng: number; lat: number } {
  const l = location.toLowerCase();
  const hit = PICKUP_POINTS.find((p) => l.includes(p.label.toLowerCase().replace('amsterdam ', ''))) ?? PICKUP_POINTS[0];
  const base = placeById(hit.placeId)!;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = ((h % 360) * Math.PI) / 180;
  const r = 0.002 + ((h >> 9) % 10) * 0.0004;
  return { lng: base.lng + Math.cos(a) * r * 1.6, lat: base.lat + Math.sin(a) * r };
}

export function placeById(id: string) {
  return PLACES.find((p) => p.id === id);
}

/** Great-circle distance in km. */
export function haversineKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Approximate road distance in km (straight line × 1.3 detour factor), at least 0.8 km. */
export function distanceKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  return Math.max(0.8, Math.round(haversineKm(a, b) * 1.3 * 10) / 10);
}

/** Pickup/destination input: a saved place id or any point picked on the map. */
export type PlaceInput = string | Place;

export function resolvePlace(input: PlaceInput): Place | undefined {
  if (typeof input === 'string') return placeById(input);
  const ok = input && Number.isFinite(input.lng) && Number.isFinite(input.lat) && Math.abs(input.lat) <= 90 && Math.abs(input.lng) <= 180;
  if (!ok) return undefined;
  return { id: input.id || `pt_${input.lng.toFixed(5)}_${input.lat.toFixed(5)}`, name: String(input.name || 'Dropped pin').slice(0, 80), address: String(input.address || '').slice(0, 120), lng: input.lng, lat: input.lat };
}
