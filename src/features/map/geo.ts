/** Small geo helpers shared by the map, Ride and the fallback renderer. */

export type LngLat = [number, number];

export const AMSTERDAM: LngLat = [4.8952, 52.3702];

export function toLngLat(p: { lng: number; lat: number }): LngLat {
  return [p.lng, p.lat];
}

export function haversineM(a: LngLat, b: LngLat) {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass bearing in degrees (0 = north, clockwise). */
export function bearing(a: LngLat, b: LngLat) {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Move `meters` from `p` towards `deg`. */
export function offset(p: LngLat, meters: number, deg: number): LngLat {
  const r = (deg * Math.PI) / 180;
  const dLat = (meters * Math.cos(r)) / 111_320;
  const dLng = (meters * Math.sin(r)) / (111_320 * Math.cos((p[1] * Math.PI) / 180));
  return [p[0] + dLng, p[1] + dLat];
}

export function lineLength(line: LngLat[]) {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += haversineM(line[i - 1], line[i]);
  return m;
}

/** Point and heading at fraction `t` (0..1) along a polyline. */
export function along(line: LngLat[], t: number): { point: LngLat; heading: number } {
  if (line.length === 0) return { point: AMSTERDAM, heading: 0 };
  if (line.length === 1) return { point: line[0], heading: 0 };
  const total = lineLength(line);
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < line.length; i++) {
    const seg = haversineM(line[i - 1], line[i]);
    if (target <= seg || i === line.length - 1) {
      const f = seg ? Math.min(1, target / seg) : 0;
      const a = line[i - 1];
      const b = line[i];
      return { point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: bearing(a, b) };
    }
    target -= seg;
  }
  return { point: line[line.length - 1], heading: 0 };
}

export function bounds(points: LngLat[]): [LngLat, LngLat] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Shortest signed rotation from `from` to `to` (degrees), for smooth heading changes. */
export function turn(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

/* Web Mercator (used by the fallback renderer so it pans and fits like a real map). */
const TILE = 512;
export function project([lng, lat]: LngLat, zoom: number) {
  const s = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * s;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return { x, y };
}
export function unproject(x: number, y: number, zoom: number): LngLat {
  const s = TILE * 2 ** zoom;
  const lng = (x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / s;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lng, lat];
}

/** Zoom level that fits `pts` in a w×h viewport with padding. */
export function fitZoom(pts: LngLat[], w: number, h: number, pad: { top: number; bottom: number; left: number; right: number }, maxZoom = 16) {
  const [sw, ne] = bounds(pts);
  for (let z = maxZoom; z > 2; z -= 0.25) {
    const a = project([sw[0], ne[1]], z);
    const b = project([ne[0], sw[1]], z);
    if (b.x - a.x <= w - pad.left - pad.right && b.y - a.y <= h - pad.top - pad.bottom) return z;
  }
  return 3;
}

/** Part of a polyline between fractions `a` and `b` (0..1) of its length. */
export function sliceLine(line: LngLat[], a: number, b: number): LngLat[] {
  if (line.length < 2 || b <= a) return [];
  const total = lineLength(line);
  const from = Math.max(0, a) * total;
  const to = Math.min(1, b) * total;
  const out: LngLat[] = [];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1];
    const q = line[i];
    const seg = haversineM(p, q);
    const s0 = acc;
    const s1 = acc + seg;
    const lerp = (d: number): LngLat => {
      const f = seg ? (d - s0) / seg : 0;
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    };
    if (s1 >= from && s0 <= to) {
      if (!out.length) out.push(from > s0 ? lerp(from) : p);
      out.push(to < s1 ? lerp(to) : q);
    }
    acc = s1;
    if (acc > to) break;
  }
  return out;
}
