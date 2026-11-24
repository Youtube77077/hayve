import { cleanLine, isLngLat } from './geo';
import { useSafeRoute } from './route';
import type { HayveMapProps } from './types';

/**
 * Cleans everything handed to a map renderer: points that aren't real coordinates are dropped,
 * long routes are thinned out and progress is kept between 0 and 1. A single NaN reaching
 * MapKit or Mapbox crashes the app, so every renderer goes through this.
 */
export function useSafeMapProps(p: HayveMapProps): HayveMapProps {
  const route = useSafeRoute(p.route);
  const fit = cleanLine(p.fit);
  const progress = Number.isFinite(p.routeProgress) ? Math.max(0, Math.min(1, p.routeProgress!)) : 0;
  return {
    ...p,
    center: isLngLat(p.center) ? p.center : undefined,
    route,
    routeProgress: progress,
    fit: fit.length ? fit : null,
    markers: p.markers?.filter((m) => isLngLat(m.coord)),
    cars: p.cars?.filter((c) => isLngLat(c.coord)).map((c) => (Number.isFinite(c.heading) ? c : { ...c, heading: 0 })),
    userLocation: isLngLat(p.userLocation) ? p.userLocation : null,
  };
}
