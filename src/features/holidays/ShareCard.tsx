import { forwardRef, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { holidays } from '../../backend/api';
import { color, font, T } from '../../design';
import { directions } from '../map';
import { fitToBox, lineKm, type LngLat, toPath, trimPrivacy } from './trip';

export type TripMapData = ReturnType<typeof holidays.myTripMap>;

export interface CardData {
  city: string;
  country: string;
  days: number;
  places: number;
  km: number;
  /** Already trimmed around the hotel and split at the privacy gaps. */
  lines: LngLat[][];
  stops: LngLat[];
  code: string | null;
  photo: string | null;
}

/**
 * Real road routes between the trip's stops. Legs the router can't draw are left out:
 * the card never draws invented straight lines between places.
 */
export function useTripRoutes(map: TripMapData | undefined) {
  const [state, setState] = useState<{ lines: LngLat[][]; km: number; loading: boolean; missing: number }>({ lines: [], km: 0, loading: true, missing: 0 });
  const key = map?.stops.map((s) => `${s.lng},${s.lat}`).join('|') ?? '';
  useEffect(() => {
    if (!map) return;
    const ctrl = new AbortController();
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      const legs: LngLat[][] = [];
      let missing = 0;
      for (let i = 1; i < map.stops.length; i++) {
        const a: LngLat = [map.stops[i - 1].lng, map.stops[i - 1].lat];
        const b: LngLat = [map.stops[i].lng, map.stops[i].lat];
        try {
          const r = await directions(a, b, ctrl.signal);
          if (r.estimated) missing++;
          else legs.push(r.line as LngLat[]);
        } catch {
          missing++;
        }
      }
      if (!alive) return;
      const hotels = map.stops.filter((s) => s.kind === 'hotel').map((s) => [s.lng, s.lat] as LngLat);
      const km = legs.length ? Math.round(legs.reduce((a, l) => a + lineKm(l), 0)) : map.estimateKm;
      const lines = legs.flatMap((l) => trimPrivacy(l, hotels, 400));
      setState({ lines, km, loading: false, missing });
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export const CARD_W = 1080;
export const CARD_H = 1920;

/** The story-sized card (9:16). Rendered at `width`; shared as an image. */
export const ShareCard = forwardRef<View, { data: CardData; width: number }>(function ShareCard({ data, width }, ref) {
  const k = width / CARD_W;
  const mapTop = 330 * k;
  const mapH = 900 * k;
  const projected = fitToBox([...data.lines, data.stops.map((s) => s)], width - 120 * k, mapH, 0.08);
  const lines = projected.slice(0, data.lines.length);
  const dots = projected[projected.length - 1] ?? [];
  const stat = (value: string, label: string) => (
    <View style={{ alignItems: 'flex-start' }}>
      <T style={{ color: color.white, fontSize: 64 * k, lineHeight: 72 * k, ...font('800') }}>{value}</T>
      <T style={{ color: color.white, fontSize: 30 * k, opacity: 0.85, ...font('600') }}>{label}</T>
    </View>
  );
  return (
    <View ref={ref} collapsable={false} style={{ width, height: width * (CARD_H / CARD_W), backgroundColor: color.black, overflow: 'hidden', borderRadius: 24 * k }}>
      {data.photo && <Image source={{ uri: data.photo }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" />}
      {/* Solid shade for legibility over any photo (no gradients). */}
      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: data.photo ? 'rgba(14,14,16,0.38)' : color.black }} />

      <View style={{ position: 'absolute', top: 90 * k, left: 60 * k, right: 60 * k, flexDirection: 'row', alignItems: 'baseline' }}>
        <T style={{ color: color.white, fontSize: 56 * k, ...font('800'), letterSpacing: -1 * k }}>Hayve</T>
        <T style={{ color: color.white, fontSize: 56 * k, ...font('500'), letterSpacing: -1 * k }}> Holiday</T>
      </View>

      <Svg width={width - 120 * k} height={mapH} style={{ position: 'absolute', top: mapTop, left: 60 * k }}>
        {lines.map((l, i) => (
          <Path key={`c${i}`} d={toPath(l)} stroke={color.indigo} strokeWidth={22 * k} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
        {lines.map((l, i) => (
          <Path key={`l${i}`} d={toPath(l)} stroke={color.white} strokeWidth={10 * k} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
        {dots.map(([x, y], i) => (
          <Circle key={`d${i}`} cx={x} cy={y} r={12 * k} fill={color.white} stroke={color.indigo} strokeWidth={6 * k} />
        ))}
      </Svg>

      <View style={{ position: 'absolute', left: 60 * k, right: 60 * k, bottom: 120 * k, gap: 36 * k }}>
        <View>
          <T style={{ color: color.white, fontSize: 96 * k, lineHeight: 104 * k, ...font('800'), letterSpacing: -2 * k }}>{data.city}</T>
          <T style={{ color: color.white, fontSize: 36 * k, opacity: 0.9, ...font('600') }}>{data.country}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 56 * k }}>
          {stat(`${data.km} km`, 'on the road')}
          {stat(String(data.places), data.places === 1 ? 'place' : 'places')}
          {stat(String(data.days), 'days')}
        </View>
        <View style={{ height: 2 * k, backgroundColor: 'rgba(255,255,255,0.4)' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T style={{ color: color.white, fontSize: 32 * k, ...font('700') }}>Everything in one app</T>
          {data.code && <T style={{ color: color.white, fontSize: 32 * k, ...font('600'), opacity: 0.9 }}>hayve.app/t/{data.code}</T>}
        </View>
      </View>
    </View>
  );
});
