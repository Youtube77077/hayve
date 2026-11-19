import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { color, font } from '../../design/tokens';
import { turn, type LngLat } from './geo';
import type { MapCar, MapMarker } from './types';

/** Marker visuals shared by every renderer (Mapbox web/native, MapLibre, preview). */

export function MarkerView({ m }: { m: MapMarker }) {
  if (m.kind === 'price') {
    const on = !!m.selected;
    return (
      <View style={{ paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: on ? color.indigo : color.white, borderWidth: 1, borderColor: on ? color.indigo : color.grey200, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
        <Text style={[{ fontSize: 13, color: on ? color.white : color.black }, font('700')]}>{m.label}</Text>
      </View>
    );
  }
  if (m.kind === 'dropoff') {
    return (
      <View style={{ alignItems: 'center' }}>
        {m.label ? <Label text={m.label} /> : null}
        <View style={{ width: 18, height: 18, backgroundColor: color.black, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 6, height: 6, backgroundColor: color.white }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center' }}>
      {m.label ? <Label text={m.label} /> : null}
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: m.selected ? color.indigo : color.black, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.white }} />
      </View>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: color.black, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 }}>
      <Text style={[{ fontSize: 12, color: color.white }, font('700')]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** The user's location: indigo dot with a soft halo. */
export function UserDot() {
  return (
    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Your location">
      <View style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(79,70,229,0.14)' }} />
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color.indigo, borderWidth: 3, borderColor: color.white }} />
    </View>
  );
}

/** Top-down car. White with black outline; the assigned driver's car is black. */
export function CarGlyph({ heading, assigned, size = 34 }: { heading: number; assigned?: boolean; size?: number }) {
  const body = assigned ? color.black : color.white;
  const glass = assigned ? '#3A3B40' : color.black;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${heading}deg` }] }}>
      <Svg width={size * 0.56} height={size} viewBox="0 0 20 36">
        <Rect x={1} y={1} width={18} height={34} rx={6} fill={body} stroke={color.black} strokeWidth={1.5} />
        <Path d="M4 9.5 C 7 7.5, 13 7.5, 16 9.5 L 15 14 L 5 14 Z" fill={glass} />
        <Path d="M5 26 L 15 26 L 16 29 C 13 30.5, 7 30.5, 4 29 Z" fill={glass} />
        <Rect x={5.5} y={15.5} width={9} height={9} rx={2} fill={body} stroke={glass} strokeWidth={0.8} />
      </Svg>
    </View>
  );
}

/**
 * Smoothly glides a car between position updates (ease toward the latest target every frame)
 * and rotates along the shortest arc. Returns the current interpolated pose.
 */
export function useGlide(car: MapCar, fps = 60) {
  const reduced = useReducedMotion();
  const [pose, setPose] = useState({ coord: car.coord, heading: car.heading });
  const target = useRef(car);
  target.current = car;
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = 0;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (t - last < 1000 / fps) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
      last = t;
      setPose((p) => {
        const k = 1 - Math.exp(-dt * 4);
        const c: LngLat = [p.coord[0] + (target.current.coord[0] - p.coord[0]) * k, p.coord[1] + (target.current.coord[1] - p.coord[1]) * k];
        const h = p.heading + turn(p.heading, target.current.heading) * Math.min(1, k * 1.6);
        if (Math.abs(c[0] - p.coord[0]) < 1e-8 && Math.abs(c[1] - p.coord[1]) < 1e-8 && Math.abs(h - p.heading) < 0.05) return p;
        return { coord: c, heading: (h + 360) % 360 };
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fps, reduced]);
  return reduced ? { coord: car.coord, heading: car.heading } : pose;
}
