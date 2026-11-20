import { PLACES } from '../../backend/places';
import type { Place } from '../../backend/types';
import { appleMaps } from './apple';
import { MAPBOX_TOKEN } from './config';
import { bearing, haversineM, type LngLat, offset } from './geo';

/**
 * Mapbox Search/Geocoding and Directions; on iPhone without a Mapbox token, Apple Maps
 * (MapKit) routes, geocoding and search; otherwise an offline estimate so Ride keeps working.
 */

const hasToken = () => MAPBOX_TOKEN.startsWith('pk.');
const API = 'https://api.mapbox.com';

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Map service error ${res.status}`);
  return (await res.json()) as T;
}

export interface PlaceResult extends Place {
  /** True when the result is an exact address on the road network. */
  snapped?: boolean;
}

/* ------------------------------------------------------- reverse geocode -- */

/** Nearest address to a point (used for the live pickup pin). Returns the snapped coordinate. */
export async function reverseGeocode(p: LngLat, signal?: AbortSignal): Promise<PlaceResult> {
  if (hasToken()) {
    try {
      type R = { features: { properties: { name: string; full_address?: string; place_formatted?: string; coordinates: { longitude: number; latitude: number } } }[] };
      const j = await getJson<R>(`${API}/search/geocode/v6/reverse?longitude=${p[0]}&latitude=${p[1]}&types=address,street&limit=1&language=en&access_token=${MAPBOX_TOKEN}`, signal);
      const f = j.features[0];
      if (f) {
        const c: LngLat = [f.properties.coordinates.longitude, f.properties.coordinates.latitude];
        const near = haversineM(c, p) < 80;
        return { id: `pt_${c[0].toFixed(5)}_${c[1].toFixed(5)}`, name: f.properties.name, address: f.properties.place_formatted ?? f.properties.full_address ?? '', lng: near ? c[0] : p[0], lat: near ? c[1] : p[1], snapped: near };
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  } else if (appleMaps) {
    try {
      const r = await appleMaps.reverseGeocode(p[1], p[0]);
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const c: LngLat = [r.lng, r.lat];
      const near = haversineM(c, p) < 80;
      return { id: `pt_${c[0].toFixed(5)}_${c[1].toFixed(5)}`, name: r.name || 'Pinned location', address: r.address, lng: near ? c[0] : p[0], lat: near ? c[1] : p[1], snapped: near };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  return estimateAddress(p);
}

function estimateAddress(p: LngLat): PlaceResult {
  let best = PLACES[0];
  let d = Infinity;
  for (const pl of PLACES) {
    const m = haversineM(p, [pl.lng, pl.lat]);
    if (m < d) {
      d = m;
      best = pl;
    }
  }
  const id = `pt_${p[0].toFixed(5)}_${p[1].toFixed(5)}`;
  if (d < 120) return { ...best, id: best.id, snapped: true };
  return { id, name: d < 1500 ? `Near ${best.name}` : 'Pinned location', address: `${p[1].toFixed(4)}, ${p[0].toFixed(4)}`, lng: p[0], lat: p[1] };
}

/* -------------------------------------------------------------- search -- */

export async function searchPlaces(q: string, near: LngLat, signal?: AbortSignal): Promise<PlaceResult[]> {
  const term = q.trim().toLowerCase();
  const saved = PLACES.filter((p) => !term || `${p.name} ${p.address}`.toLowerCase().includes(term));
  if (term && !hasToken() && appleMaps) {
    try {
      const remote = await appleMaps.search(q, near[1], near[0]);
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return [...saved.slice(0, 3), ...remote.map((r, i) => ({ id: `ap_${i}_${r.lat.toFixed(5)}_${r.lng.toFixed(5)}`, name: r.name, address: r.address, lng: r.lng, lat: r.lat, snapped: true }))];
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      return saved;
    }
  }
  if (!term || !hasToken()) return saved;
  try {
    type R = { features: { id: string; properties: { name: string; place_formatted?: string; full_address?: string; coordinates: { longitude: number; latitude: number } } }[] };
    const j = await getJson<R>(`${API}/search/geocode/v6/forward?q=${encodeURIComponent(q)}&proximity=${near[0]},${near[1]}&country=nl,be,de&limit=6&language=en&access_token=${MAPBOX_TOKEN}`, signal);
    const remote = j.features.map((f) => ({ id: `mb_${f.id}`, name: f.properties.name, address: f.properties.place_formatted ?? f.properties.full_address ?? '', lng: f.properties.coordinates.longitude, lat: f.properties.coordinates.latitude, snapped: true }));
    return [...saved.slice(0, 3), ...remote];
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return saved;
  }
}

/* ---------------------------------------------------------- directions -- */

export interface RouteResult {
  line: LngLat[];
  km: number;
  minutes: number;
  /** Start and end snapped to the road network. */
  start: LngLat;
  end: LngLat;
  estimated: boolean;
}

export async function directions(a: LngLat, b: LngLat, signal?: AbortSignal): Promise<RouteResult> {
  if (hasToken()) {
    try {
      type R = { routes: { geometry: { coordinates: LngLat[] }; distance: number; duration: number }[]; waypoints: { location: LngLat }[] };
      const j = await getJson<R>(`${API}/directions/v5/mapbox/driving-traffic/${a[0]},${a[1]};${b[0]},${b[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`, signal);
      const r = j.routes[0];
      if (r) return { line: r.geometry.coordinates, km: r.distance / 1000, minutes: r.duration / 60, start: j.waypoints[0]?.location ?? a, end: j.waypoints[1]?.location ?? b, estimated: false };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  } else if (appleMaps) {
    try {
      const r = await appleMaps.route(a[1], a[0], b[1], b[0]);
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      if (r.coordinates.length > 1) return { line: r.coordinates, km: r.distance / 1000, minutes: r.duration / 60, start: r.coordinates[0], end: r.coordinates[r.coordinates.length - 1], estimated: false };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  return estimateRoute(a, b);
}

/** Road-like estimate: a few right-angle legs following the dominant direction (preview only). */
export function estimateRoute(a: LngLat, b: LngLat): RouteResult {
  const line: LngLat[] = [a];
  const dLng = b[0] - a[0];
  const dLat = b[1] - a[1];
  const legs = 3;
  let cur = a;
  for (let i = 1; i <= legs; i++) {
    const f = i / legs;
    const lngFirst = i % 2 === 1;
    const target: LngLat = [a[0] + dLng * f, a[1] + dLat * f];
    const mid: LngLat = lngFirst ? [target[0], cur[1]] : [cur[0], target[1]];
    line.push(mid, target);
    cur = target;
  }
  line[line.length - 1] = b;
  const km = Math.max(0.8, (haversineM(a, b) * 1.3) / 1000);
  return { line, km, minutes: 4 + km * 2.3, start: a, end: b, estimated: true };
}

/** Starting point for a driver a few minutes away from the pickup (simulation). */
export function driverStart(pickup: LngLat, seed: number): LngLat {
  return offset(pickup, 900 + (seed % 5) * 120, (seed * 67) % 360);
}

export { bearing };
