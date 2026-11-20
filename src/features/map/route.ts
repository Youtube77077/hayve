import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { type LngLat, sliceLine } from './geo';

/**
 * Hayve route style: the route draws itself from the start (700ms, ease out), sits on a white
 * casing so it stands out on any map, and the part already travelled turns grey.
 */
export const ROUTE_STYLE = { line: '#0E0E10', casing: '#FFFFFF', done: 'rgba(107,110,120,0.5)', width: 5, casingWidth: 9 } as const;

export function useRouteReveal(route: LngLat[] | null | undefined) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(1);
  const key = route && route.length > 1 ? `${route.length}:${route[0].join()}:${route[route.length - 1].join()}` : '';
  const raf = useRef(0);
  useEffect(() => {
    if (!key || reduced) return setT(1);
    const t0 = Date.now();
    const D = 700;
    const tick = () => {
      const x = Math.min(1, (Date.now() - t0) / D);
      setT(1 - (1 - x) ** 3);
      if (x < 1) raf.current = requestAnimationFrame(tick);
    };
    setT(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [key, reduced]);
  return t;
}

/** Splits a route into travelled (grey) and remaining (black) parts, honouring the reveal. */
export function routeParts(route: LngLat[] | null | undefined, reveal: number, progress = 0) {
  if (!route || route.length < 2) return { done: [] as LngLat[], todo: [] as LngLat[] };
  const p = Math.max(0, Math.min(progress, reveal));
  return { done: p > 0 ? sliceLine(route, 0, p) : [], todo: sliceLine(route, p, reveal) };
}
