/** Small geo helpers shared by the map, Ride and the fallback renderer. */

export type LngLat = [number, number];

/** Map centre before anything is known (New York). Screens pass the user's location or city. */
export const DEFAULT_CENTER: LngLat = [-73.9857, 40.7484];

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
  if (line.length === 0) return { point: DEFAULT_CENTER, heading: 0 };
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

/* Safety: map engines (MapKit in particular) crash on NaN coordinates or impossible padding. */

export function isLngLat(p: unknown): p is LngLat {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1] as number) <= 90 && Math.abs(p[0] as number) <= 180;
}

/** Drops invalid points and repeats so a line is always safe to hand to a map engine. */
export function cleanLine(line: readonly unknown[] | null | undefined): LngLat[] {
  const out: LngLat[] = [];
  for (const p of line ?? []) {
    if (!isLngLat(p)) continue;
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push([p[0], p[1]]);
  }
  return out;
}

/**
 * Fewer points, same shape: keeps a point only when it's more than `minM` metres from the last kept
 * one (or a sharp turn), always keeping both ends. Road routes from Apple come with thousands of
 * points; drawing them every animation frame is what made the map stutter and crash.
 */
export function simplifyLine(line: LngLat[], maxPoints = 400): LngLat[] {
  if (line.length <= maxPoints) return line;
  const minM = lineLength(line) / maxPoints;
  const out: LngLat[] = [line[0]];
  for (let i = 1; i < line.length - 1; i++) {
    const last = out[out.length - 1];
    const d = haversineM(last, line[i]);
    const sharp = out.length > 1 && Math.abs(turn(bearing(out[out.length - 2], last), bearing(last, line[i]))) > 50 && d > minM / 4;
    if (d >= minM || sharp) out.push(line[i]);
  }
  out.push(line[line.length - 1]);
  return out;
}

/**
 * Padding that leaves at least `keep` of the map visible (default 30% of each side). Without this,
 * a tall bottom sheet plus the header could ask the map to fit a route into less than zero pixels.
 */
export function safePadding(p: { top: number; right: number; bottom: number; left: number }, w: number, h: number, extra = 0, keep = 0.3) {
  const fix = (a: number, b: number, size: number) => {
    a = Math.max(0, (Number.isFinite(a) ? a : 0) + extra);
    b = Math.max(0, (Number.isFinite(b) ? b : 0) + extra);
    if (!size || size <= 0) return [a, b];
    const room = size * (1 - keep);
    if (a + b <= room) return [a, b];
    const k = room / (a + b);
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  const [top, bottom] = fix(p.top, p.bottom, h);
  const [left, right] = fix(p.left, p.right, w);
  return { top, right, bottom, left };
}

/** True when the points are so close together that "fit" should just centre on them. */
export function tinySpan(pts: LngLat[]) {
  const [sw, ne] = bounds(pts);
  return haversineM(sw, ne) < 30;
}
