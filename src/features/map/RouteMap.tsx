import { useEffect, useMemo, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius } from '../../design/tokens';
import { along, type LngLat } from './geo';
import { HayveMap } from './HayveMap';
import { directions, estimateRoute, type RouteResult } from './services';

/**
 * A route between two points on the Hayve map, with an optional vehicle at `progress` (0..1).
 * Used for trip receipts, order tracking and partner dashboards.
 */
export function RouteMap({ from, to, progress, height = 260, style, interactive = false }: { from: { lng: number; lat: number }; to: { lng: number; lat: number }; progress?: number; height?: number; style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  const a: LngLat = [from.lng, from.lat];
  const b: LngLat = [to.lng, to.lat];
  const key = `${a.join()};${b.join()}`;
  const [route, setRoute] = useState<RouteResult>(() => estimateRoute(a, b));
  useEffect(() => {
    const ctrl = new AbortController();
    setRoute(estimateRoute(a, b));
    directions(a, b, ctrl.signal).then(setRoute).catch(() => {});
    return () => ctrl.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const car = useMemo(() => (progress == null ? null : along(route.line, progress)), [route, progress]);
  return (
    <HayveMap
      style={[{ height, borderRadius: radius.lg }, style]}
      center={a}
      route={route.line}
      fit={[a, b]}
      interactive={interactive}
      markers={[
        { id: 'a', coord: a, kind: 'pickup' },
        { id: 'b', coord: b, kind: 'dropoff' },
      ]}
      cars={car ? [{ id: 'v', coord: car.point, heading: car.heading, assigned: true }] : []}
    />
  );
}
