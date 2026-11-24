import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { cleanLine, type LngLat, simplifyLine, sliceLine } from './geo';

/**
 * Hayve route style (indigo, like the logo wave-v): the route draws itself from the start
 * (700ms, ease out), sits on a white casing so it stands out on any map, and the part already travelled turns grey.
 */
export const ROUTE_STYLE = { line: '#4F46E5', casing: '#FFFFFF', done: 'rgba(107,110,120,0.5)', width: 5, casingWidth: 9 } as const;

export function useRouteReveal(route: LngLat[] | null | undefined) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(1);
  const key = route && route.length > 1 ? `${route.length}:${route[0].join()}:${route[route.length - 1].join()}` : '';
  const raf = useRef(0);
  useEffect(() => {
    if (!key || reduced) return setT(1);
    const t0 = Date.now();
    const D = 700;
    // About 20 steps: smooth to the eye, but the native map isn't asked to redraw every frame.
    let last = 0;
    const tick = () => {
      const now = Date.now();
      const x = Math.min(1, (now - t0) / D);
      if (x >= 1 || now - last >= 34) {
        last = now;
        setT(1 - (1 - x) ** 3);
      }
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

/** The route made safe to draw: invalid points dropped and long road routes thinned out. */
export function useSafeRoute(route: LngLat[] | null | undefined): LngLat[] | null {
  return useMemo(() => {
    const line = simplifyLine(cleanLine(route));
    return line.length > 1 ? line : null;
  }, [route]);
}
