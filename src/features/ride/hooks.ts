import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { bearing, haversineM, type LngLat, type MapCar, offset } from '../map';

/** The device location (asks once). Falls back to `fallback` when denied or unavailable. */
export function useUserLocation(fallback: LngLat) {
  const [loc, setLoc] = useState<{ coord: LngLat; real: boolean }>({ coord: fallback, real: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const c: LngLat = [pos.coords.longitude, pos.coords.latitude];
        // The preview only covers the Amsterdam area: keep the demo location when far away.
        if (!cancelled && haversineM(c, fallback) < 40_000) setLoc({ coord: c, real: true });
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return loc;
}

interface SimCar extends MapCar {
  speed: number;
}

function spawn(center: LngLat, i: number): SimCar {
  const d = 160 + ((i * 137) % 420);
  const a = (i * 97 + 20) % 360;
  return { id: `car${i}`, coord: offset(center, d, a), heading: (Math.round(a / 90) * 90 + 90) % 360, speed: 6 + (i % 4) * 1.5 };
}

/**
 * Simulated nearby cars around `center`: they drive straight, turn at right angles now and then
 * and stay within ~1.2 km. Positions update once per second; the map glides between updates.
 */
export function useNearbyCars(center: LngLat | null, count = 7) {
  const [cars, setCars] = useState<SimCar[]>([]);
  const centerRef = useRef(center);
  centerRef.current = center;
  const key = center ? `${center[0].toFixed(3)},${center[1].toFixed(3)}` : '';

  useEffect(() => {
    if (!centerRef.current) return setCars([]);
    const c0 = centerRef.current;
    setCars((cur) => (cur.length && haversineM(cur[0].coord, c0) < 2000 ? cur : Array.from({ length: count }, (_, i) => spawn(c0, i + 1))));
  }, [key, count]);

  useEffect(() => {
    const t = setInterval(() => {
      const c = centerRef.current;
      if (!c) return;
      setCars((cur) =>
        cur.map((car, i) => {
          let heading = car.heading;
          const dist = haversineM(car.coord, c);
          if (dist > 700) heading = Math.round(bearing(car.coord, c) / 90) * 90;
          else if (Math.random() < 0.12) heading = (heading + (Math.random() < 0.5 ? 90 : 270)) % 360;
          return { ...car, heading: (heading + 360) % 360, coord: offset(car.coord, car.speed * (1 + (i % 2) * 0.2), heading) };
        }),
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return cars;
}

/** Minutes for the nearest car to reach `p` (city speed ~ 18 km/h incl. lights). */
export function nearestEta(cars: MapCar[], p: LngLat | null) {
  if (!p || cars.length === 0) return null;
  const m = Math.min(...cars.map((c) => haversineM(c.coord, p)));
  return Math.max(1, Math.round((m * 1.4) / 300));
}
