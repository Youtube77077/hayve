import type { Place } from './types';

/**
 * Saved and popular places (real coordinates, WGS84) in the cities Hayve shows by default.
 * Ride works anywhere: real addresses come from Mapbox (or Apple Maps on iPhone); these are only
 * quick picks, and the app shows the set nearest to you.
 */
export const PLACES: Place[] = [
  // Saved places for the demo account (Brooklyn, New York)
  { id: 'home', name: 'Home', address: '245 Bedford Ave, Brooklyn, NY 11211', lng: -73.9571, lat: 40.7175 },
  { id: 'work', name: 'Studio', address: '55 Washington St, Brooklyn, NY 11201', lng: -73.9897, lat: 40.7033 },
  // New York
  { id: 'grand_central', name: 'Grand Central Terminal', address: '89 E 42nd St, New York, NY 10017', lng: -73.9772, lat: 40.7527 },
  { id: 'times_square', name: 'Times Square', address: 'Manhattan, NY 10036', lng: -73.9855, lat: 40.758 },
  { id: 'central_park', name: 'Central Park', address: 'Bethesda Terrace, New York, NY 10024', lng: -73.9712, lat: 40.774 },
  { id: 'wall_street', name: 'Wall Street', address: 'Wall St, New York, NY 10005', lng: -74.0088, lat: 40.706 },
  { id: 'penn', name: 'Penn Station', address: '8th Ave & W 31st St, New York, NY 10001', lng: -73.9935, lat: 40.7506 },
  { id: 'jfk', name: 'JFK Airport', address: 'Queens, NY 11430', lng: -73.7781, lat: 40.6413 },
  { id: 'lga', name: 'LaGuardia Airport', address: 'Queens, NY 11371', lng: -73.874, lat: 40.7769 },
  // Los Angeles
  { id: 'lax', name: 'LAX Airport', address: '1 World Way, Los Angeles, CA 90045', lng: -118.4085, lat: 33.9416 },
  { id: 'santa_monica', name: 'Santa Monica Pier', address: '200 Santa Monica Pier, CA 90401', lng: -118.4973, lat: 34.0094 },
  { id: 'hollywood', name: 'Hollywood & Highland', address: '6801 Hollywood Blvd, Los Angeles, CA 90028', lng: -118.3398, lat: 34.1022 },
  { id: 'union_station_la', name: 'Union Station', address: '800 N Alameda St, Los Angeles, CA 90012', lng: -118.2365, lat: 34.0562 },
  // London
  { id: 'kings_cross', name: "King's Cross St Pancras", address: 'Euston Rd, London N1C 4QP', lng: -0.1238, lat: 51.5308 },
  { id: 'oxford_circus', name: 'Oxford Circus', address: 'Oxford St, London W1B 3AG', lng: -0.1418, lat: 51.5152 },
  { id: 'tower_bridge', name: 'Tower Bridge', address: 'Tower Bridge Rd, London SE1 2UP', lng: -0.0754, lat: 51.5055 },
  { id: 'canary_wharf', name: 'Canary Wharf', address: 'Canada Square, London E14 5AB', lng: -0.0235, lat: 51.5054 },
  { id: 'heathrow', name: 'Heathrow Airport', address: 'Longford, Hounslow TW6', lng: -0.4543, lat: 51.47 },
  // Dublin
  { id: 'dublin_airport', name: 'Dublin Airport', address: 'Collinstown, Co. Dublin', lng: -6.2499, lat: 53.4264 },
  { id: 'grafton', name: 'Grafton Street', address: 'Grafton St, Dublin 2', lng: -6.2597, lat: 53.3418 },
  { id: 'heuston', name: 'Heuston Station', address: 'St John’s Rd W, Dublin 8', lng: -6.2925, lat: 53.3464 },
  { id: 'docklands', name: 'Grand Canal Dock', address: 'Grand Canal Dock, Dublin 2', lng: -6.238, lat: 53.3398 },
  // Toronto
  { id: 'union_toronto', name: 'Union Station', address: '65 Front St W, Toronto, ON', lng: -79.3806, lat: 43.6453 },
  { id: 'yyz', name: 'Toronto Pearson Airport', address: '6301 Silver Dart Dr, Mississauga, ON', lng: -79.6248, lat: 43.6777 },
  // Amsterdam
  { id: 'centraal', name: 'Amsterdam Centraal', address: 'Stationsplein, 1012 AB Amsterdam', lng: 4.9003, lat: 52.3791 },
  { id: 'rijks', name: 'Rijksmuseum', address: 'Museumstraat 1, Amsterdam', lng: 4.8852, lat: 52.36 },
  { id: 'schiphol', name: 'Schiphol Airport', address: 'Evert van de Beekstraat 202', lng: 4.7639, lat: 52.3105 },
  // Paris
  { id: 'gare_du_nord', name: 'Gare du Nord', address: '18 Rue de Dunkerque, 75010 Paris', lng: 2.3553, lat: 48.8809 },
  { id: 'louvre', name: 'Louvre', address: 'Rue de Rivoli, 75001 Paris', lng: 2.3376, lat: 48.8606 },
  { id: 'cdg', name: 'Charles de Gaulle Airport', address: '95700 Roissy-en-France', lng: 2.5479, lat: 49.0097 },
  // Berlin
  { id: 'berlin_hbf', name: 'Berlin Hauptbahnhof', address: 'Europaplatz 1, 10557 Berlin', lng: 13.3694, lat: 52.5251 },
  { id: 'brandenburg', name: 'Brandenburg Gate', address: 'Pariser Platz, 10117 Berlin', lng: 13.3777, lat: 52.5163 },
  { id: 'ber', name: 'Berlin Brandenburg Airport', address: '12529 Schönefeld', lng: 13.5033, lat: 52.3667 },
];

/** Quick-pick places near a point (within ~60 km), nearest first. Saved places come first when near. */
export function placesNear(p: { lng: number; lat: number }, limit = 12) {
  return PLACES.map((x) => ({ x, d: haversineKm(p, x) }))
    .filter((r) => r.d < 60)
    .sort((a, b) => (a.x.id === 'home' || a.x.id === 'work' ? -1 : 0) - (b.x.id === 'home' || b.x.id === 'work' ? -1 : 0) || a.d - b.d)
    .slice(0, limit)
    .map((r) => r.x);
}

/** Pickup points for Drive and other location-based listings. */
export const PICKUP_POINTS: { label: string; placeId: string }[] = [
  { label: 'Manhattan, New York', placeId: 'times_square' },
  { label: 'Brooklyn, New York', placeId: 'work' },
  { label: 'JFK Airport', placeId: 'jfk' },
  { label: 'LAX Airport', placeId: 'lax' },
  { label: 'Santa Monica, Los Angeles', placeId: 'santa_monica' },
  { label: "King's Cross, London", placeId: 'kings_cross' },
  { label: 'Dublin Airport', placeId: 'dublin_airport' },
  { label: 'Amsterdam Centraal', placeId: 'centraal' },
];

/** Approximate coordinates for a listing's location text, spread a little per listing so pins don't stack. */
export function locationCoord(location: string, seed: string): { lng: number; lat: number } {
  const l = location.toLowerCase();
  const hit = PICKUP_POINTS.find((p) => l.includes(p.label.toLowerCase().split(',')[0])) ?? PICKUP_POINTS[0];
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
