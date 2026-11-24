/**
 * Trip map maths for the holiday share card (pure, tested in tests/holidays.test.ts).
 * Lines are [lng, lat] pairs.
 */
export type LngLat = [number, number];

const R = 6371000;
export function metersBetween(a: LngLat, b: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineKm(line: LngLat[]) {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += metersBetween(line[i - 1], line[i]);
  return m / 1000;
}

/**
 * Privacy zone (like Strava): removes every point within `meters` of a private place (the hotel)
 * so a shared map never shows exactly where someone stayed. Returns the pieces that remain, so the
 * card never draws a line across the hidden area.
 */
export function trimPrivacy(line: LngLat[], privatePoints: LngLat[], meters = 400): LngLat[][] {
  const out: LngLat[][] = [];
  let cur: LngLat[] = [];
  for (const p of line) {
    if (privatePoints.every((q) => metersBetween(p, q) > meters)) cur.push(p);
    else {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Projects lines into a box (Web Mercator, aspect kept, centred) for drawing on the card. */
export function fitToBox(lines: LngLat[][], width: number, height: number, pad = 0.1): [number, number][][] {
  const merc = ([lng, lat]: LngLat): [number, number] => [lng, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI)];
  const all = lines.flat().map(merc);
  if (!all.length) return [];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width * (1 - 2 * pad)) / spanX, (height * (1 - 2 * pad)) / spanY);
  const offX = (width - spanX * scale) / 2, offY = (height - spanY * scale) / 2;
  return lines.map((l) => l.map(merc).map(([x, y]) => [offX + (x - minX) * scale, height - (offY + (y - minY) * scale)] as [number, number]));
}

export const toPath = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
