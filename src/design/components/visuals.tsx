import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { OFFICIAL_LOGO, OFFICIAL_LOGO_ASPECT } from '../brand';
import { alpha, color, type IconName, radius } from '../tokens';
import { Photo, T } from './primitives';

/* ------------------------------------------------------------------ Logo -- */

/**
 * Hayve brand mark. Renders the official logo once it is added in
 * src/design/brand.ts; until then a neutral typographic placeholder is shown.
 */
export function HayveLogo({ height = 28, tone = 'dark' }: { height?: number; tone?: 'dark' | 'light' }) {
  if (OFFICIAL_LOGO) {
    return <Image source={OFFICIAL_LOGO} style={{ height, width: height * OFFICIAL_LOGO_ASPECT }} contentFit="contain" accessibilityLabel="Hayve" />;
  }
  return (
    <T accessibilityLabel="Hayve" style={{ fontSize: height * 0.92, lineHeight: height * 1.05, fontWeight: '900', letterSpacing: -height * 0.045, color: tone === 'dark' ? color.ink : '#fff' }}>
      hayve
    </T>
  );
}

/* ------------------------------------------------------------------- Map -- */

export interface MapPoint {
  x: number;
  y: number;
}

/**
 * Stylised Hayve city map (vector, works identically on iOS, iPad and web).
 * Shows an optional route between two points and a moving vehicle marker.
 */
export function CityMap({ from, to, progress, vehicle = 'car', style, height = 260, markers = [] }: { from?: MapPoint; to?: MapPoint; progress?: number; vehicle?: 'car' | 'bike' | 'parcel'; style?: StyleProp<ViewStyle>; height?: number; markers?: (MapPoint & { icon: IconName })[] }) {
  const W = 1000;
  const H = 700;
  const route = useMemo(() => {
    if (!from || !to) return null;
    const a = { x: from.x * W, y: from.y * H };
    const b = { x: to.x * W, y: to.y * H };
    // Manhattan-ish route with one bend for a road-like path.
    const mid = { x: b.x, y: a.y };
    return { a, b, mid, d: `M ${a.x} ${a.y} L ${mid.x} ${mid.y} L ${b.x} ${b.y}` };
  }, [from, to]);

  const vehiclePos = useMemo(() => {
    if (!route || progress == null) return null;
    const l1 = Math.abs(route.mid.x - route.a.x);
    const l2 = Math.abs(route.b.y - route.mid.y);
    const total = l1 + l2 || 1;
    const dist = Math.max(0, Math.min(1, progress)) * total;
    if (dist <= l1) return { x: route.a.x + Math.sign(route.mid.x - route.a.x) * dist, y: route.a.y };
    return { x: route.mid.x, y: route.mid.y + Math.sign(route.b.y - route.mid.y) * (dist - l1) };
  }, [route, progress]);

  const vIcon: IconName = vehicle === 'car' ? 'car-sport' : vehicle === 'bike' ? 'bicycle' : 'cube';

  return (
    <View style={[{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#ECEAF7' }, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={W} height={H} fill="#EEEDF7" />
        {/* IJ river */}
        <Path d="M 0 150 C 200 120 380 210 560 170 C 720 135 860 190 1000 160 L 1000 260 C 860 280 720 230 560 265 C 380 300 200 220 0 250 Z" fill="#CFD8F6" />
        {/* canal rings */}
        <G fill="none" stroke="#CFD8F6" strokeWidth={14}>
          <Path d="M 270 280 C 300 470 700 470 740 280" />
          <Path d="M 230 270 C 250 530 760 530 790 270" />
          <Path d="M 190 265 C 200 590 820 590 840 265" />
        </G>
        {/* Amstel */}
        <Path d="M 520 420 C 560 520 600 600 720 700" stroke="#CFD8F6" strokeWidth={22} fill="none" />
        {/* parks */}
        <Rect x={250} y={430} width={140} height={60} rx={26} fill="#D7EFC8" />
        <Rect x={650} y={380} width={90} height={60} rx={22} fill="#D7EFC8" />
        <Rect x={180} y={200} width={80} height={45} rx={18} fill="#D7EFC8" />
        {/* roads */}
        <G stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round">
          <Path d="M 0 330 L 1000 330" />
          <Path d="M 0 520 L 1000 560" />
          <Path d="M 450 0 L 470 700" />
          <Path d="M 120 700 L 340 300" />
          <Path d="M 640 260 L 900 700" />
          <Path d="M 0 640 L 1000 610" />
        </G>
        <G stroke="#F7F6FD" strokeWidth={4}>
          <Path d="M 0 420 L 1000 440" />
          <Path d="M 300 0 L 260 700" />
          <Path d="M 620 0 L 640 700" />
          <Path d="M 800 0 L 760 700" />
        </G>
        {markers.map((m, i) => (
          <Circle key={i} cx={m.x * W} cy={m.y * H} r={10} fill={alpha(color.primary, 0.25)} />
        ))}
        {route && (
          <>
            <Path d={route.d} stroke={color.ink} strokeWidth={12} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={route.a.x} cy={route.a.y} r={16} fill={color.ink} />
            <Circle cx={route.a.x} cy={route.a.y} r={7} fill="#fff" />
            <Rect x={route.b.x - 15} y={route.b.y - 15} width={30} height={30} fill={color.ink} />
            <Rect x={route.b.x - 6} y={route.b.y - 6} width={12} height={12} fill="#fff" />
          </>
        )}
      </Svg>
      {vehiclePos && (
        <View
          style={{
            position: 'absolute',
            left: `${(vehiclePos.x / W) * 100}%`,
            top: `${(vehiclePos.y / H) * 100}%`,
            marginLeft: -18,
            marginTop: -18,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: color.lime,
            borderWidth: 3,
            borderColor: color.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={vIcon} size={17} color={color.ink} />
        </View>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------- QR -- */

/** Deterministic QR-style code for the simulation (not a scannable QR symbol). */
export function SimQR({ value, size = 180 }: { value: string; size?: number }) {
  const n = 25;
  const cells = useMemo(() => {
    let h = 2166136261;
    const out: boolean[] = [];
    for (let i = 0; i < n * n; i++) {
      h ^= value.charCodeAt(i % value.length) + i;
      h = Math.imul(h, 16777619);
      out.push(((h >>> 0) & 7) < 3);
    }
    return out;
  }, [value]);
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const s = size / n;
  return (
    <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: radius.md, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        {cells.map((on, i) => {
          const x = i % n;
          const y = Math.floor(i / n);
          if (finder(x, y)) return null;
          return on ? <Rect key={i} x={x * s} y={y * s} width={s} height={s} fill={color.ink} /> : null;
        })}
        {[
          [0, 0],
          [n - 7, 0],
          [0, n - 7],
        ].map(([fx, fy], i) => (
          <G key={i}>
            <Rect x={fx * s} y={fy * s} width={7 * s} height={7 * s} fill={color.ink} rx={s} />
            <Rect x={(fx + 1) * s} y={(fy + 1) * s} width={5 * s} height={5 * s} fill="#fff" rx={s * 0.6} />
            <Rect x={(fx + 2) * s} y={(fy + 2) * s} width={3 * s} height={3 * s} fill={color.primary} rx={s * 0.4} />
          </G>
        ))}
      </Svg>
    </View>
  );
}

/* --------------------------------------------------------------- Charts -- */

export function BarChart({ data, height = 120, light, format }: { data: { label: string; cents: number }[]; height?: number; light?: boolean; format?: (c: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: height + 22 }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.cents / max) * height);
        const last = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View accessibilityLabel={`${d.label}: ${format ? format(d.cents) : d.cents}`} style={{ width: '100%', maxWidth: 34, height: h, borderRadius: 8, backgroundColor: last ? color.lime : light ? 'rgba(255,255,255,0.18)' : color.primaryTint }} />
            <T variant="caption" color={light ? color.textOnDarkSecondary : color.textTertiary}>
              {d.label}
            </T>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- Timeline -- */

export function Timeline({ steps, current }: { steps: { key: string; label: string; sub?: string }[]; current: number }) {
  return (
    <View>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 24 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? color.primary : active ? color.lime : color.surfaceSunken, borderWidth: active ? 2 : 0, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
                {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.ink }} />}
              </View>
              {i < steps.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: done ? color.primary : color.line }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 18 }}>
              <T variant="headline" color={done || active ? color.text : color.textTertiary}>
                {s.label}
              </T>
              {s.sub && (
                <T variant="footnote" color={color.textSecondary}>
                  {s.sub}
                </T>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ---------------------------------------------------------- ProgressBar -- */

export function ProgressBar({ value, tone = color.primary }: { value: number; tone?: string }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: color.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: tone, borderRadius: 4 }} />
    </View>
  );
}

/* -------------------------------------------------------------- Gallery -- */

/** Swipeable photo gallery that sizes itself to its container. */
export function Gallery({ images, aspect = 1, rounded = 0, icon = 'image-outline', label, overlay }: { images: string[]; aspect?: number; rounded?: number; icon?: IconName; label?: string; overlay?: React.ReactNode }) {
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%', borderRadius: rounded, overflow: 'hidden', backgroundColor: color.surfaceSunken }}>
      {w > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w))} onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w))} scrollEventThrottle={64}>
          {(images.length ? images : ['']).map((uri, i) => (
            <Photo key={`${uri}${i}`} uri={uri || undefined} style={{ width: w, height: w / aspect }} icon={icon} label={label} />
          ))}
        </ScrollView>
      )}
      {w === 0 && <View style={{ height: 300 }} />}
      {images.length > 1 && (
        <View style={{ position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', gap: 6, backgroundColor: 'rgba(17,13,46,0.5)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill }}>
          {images.map((_, i) => (
            <View key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? color.lime : 'rgba(255,255,255,0.6)' }} />
          ))}
        </View>
      )}
      {overlay}
    </View>
  );
}
