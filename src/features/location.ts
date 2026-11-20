import { ride } from '../backend/api';
import { useLive } from '../lib/hooks';
import { haversineM, type LngLat } from './map';
import { useUserLocation } from './ride/hooks';

/**
 * Where the person is: the device location when they allow it, otherwise their saved home or
 * their country's main city. Every map starts here.
 */
export function useMyArea() {
  const start = useLive(() => ride.startPoint()).data;
  const fallback: LngLat = start ? [start.lng, start.lat] : [-73.9857, 40.7484];
  return useUserLocation(fallback);
}

/** Points within `km` of `here` (for fitting a map to what's nearby). */
export function nearby(points: LngLat[], here: LngLat, km = 80) {
  return points.filter((p) => haversineM(p, here) < km * 1000);
}
