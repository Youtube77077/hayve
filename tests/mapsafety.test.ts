import { describe, expect, it } from 'vitest';
import { cleanLine, isLngLat, type LngLat, lineLength, safePadding, simplifyLine, tinySpan } from '../src/features/map/geo';

describe('map safety (no NaN or impossible padding reaches the map engine)', () => {
  it('drops points that are not real coordinates and repeated points', () => {
    expect(isLngLat([4.9, 52.37])).toBe(true);
    expect(isLngLat([NaN, 52])).toBe(false);
    expect(isLngLat([200, 10])).toBe(false);
    expect(cleanLine([[1, 2], [1, 2], [NaN, 3], null, [3, 4], 'x'] as unknown[])).toEqual([[1, 2], [3, 4]]);
    expect(cleanLine(undefined)).toEqual([]);
  });

  it('thins out long road routes but keeps both ends and the overall length', () => {
    const line: LngLat[] = Array.from({ length: 5000 }, (_, i) => [-73.99 + i * 0.00001, 40.73 + Math.sin(i / 300) * 0.002]);
    const s = simplifyLine(line, 400);
    expect(s.length).toBeLessThanOrEqual(800);
    expect(s[0]).toEqual(line[0]);
    expect(s[s.length - 1]).toEqual(line[line.length - 1]);
    expect(Math.abs(lineLength(s) - lineLength(line)) / lineLength(line)).toBeLessThan(0.02);
    const short: LngLat[] = [[0, 0], [1, 1]];
    expect(simplifyLine(short)).toBe(short);
  });

  it('never pads more than the map can hold (the iPhone "Invalid Region" crash)', () => {
    // Phone: 390×760 map, header 110 and a 560 bottom sheet, plus 56 around the route.
    const p = safePadding({ top: 110, bottom: 560, left: 0, right: 0 }, 390, 760, 56);
    expect(p.top + p.bottom).toBeLessThanOrEqual(760 * 0.7);
    expect(p.bottom).toBeGreaterThan(p.top);
    expect(p.left + p.right).toBeLessThan(390);
    // Small padding is left alone.
    expect(safePadding({ top: 10, bottom: 20, left: 0, right: 0 }, 390, 760, 56)).toEqual({ top: 66, bottom: 76, left: 56, right: 56 });
    // Unknown size or bad numbers don't produce NaN.
    const q = safePadding({ top: NaN, bottom: 10, left: 0, right: 0 }, 0, 0);
    expect(Object.values(q).every(Number.isFinite)).toBe(true);
  });

  it('treats points on top of each other as one spot', () => {
    expect(tinySpan([[4.9, 52.37], [4.90001, 52.37001]])).toBe(true);
    expect(tinySpan([[4.9, 52.37], [4.95, 52.39]])).toBe(false);
  });
});
