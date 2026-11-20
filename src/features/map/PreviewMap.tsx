import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, font } from '../../design/tokens';
import { AMSTERDAM, fitZoom, type LngLat, project, unproject } from './geo';
import { CarGlyph, MarkerView, useGlide, UserDot } from './markers';
import { ROUTE_STYLE, routeParts, useRouteReveal } from './route';
import { MAP_COLORS } from './style';
import { type HayveMapHandle, type HayveMapProps, type MapCar, NO_PADDING } from './types';

/**
 * Built-in vector preview of Amsterdam in the Hayve map style. Used only when no map key
 * is configured (see config.ts). It uses real coordinates and Web Mercator, so pins,
 * routes and cars land where they would on Mapbox. Not a tile server, not a static image.
 */

const C = MAP_COLORS;
type Line = LngLat[];

const IJ: Line = [[4.78, 52.392], [4.85, 52.388], [4.88, 52.382], [4.9, 52.3795], [4.93, 52.378], [4.96, 52.377], [5.02, 52.38], [5.02, 52.388], [4.96, 52.385], [4.93, 52.3865], [4.905, 52.386], [4.88, 52.392], [4.85, 52.398], [4.78, 52.404]];
const AMSTEL: Line = [[4.9015, 52.3675], [4.904, 52.361], [4.907, 52.3555], [4.914, 52.349], [4.921, 52.341], [4.925, 52.33], [4.93, 52.31]];
const PARKS: Line[] = [
  [[4.856, 52.3562], [4.8805, 52.3608], [4.8815, 52.3592], [4.857, 52.3546]],
  [[4.9165, 52.3585], [4.9245, 52.3585], [4.9245, 52.3615], [4.9165, 52.3615]],
  [[4.8715, 52.385], [4.8825, 52.385], [4.8825, 52.3885], [4.8715, 52.3885]],
  [[4.82, 52.305], [4.865, 52.305], [4.865, 52.33], [4.82, 52.33]],
  [[4.94, 52.366], [4.952, 52.366], [4.952, 52.372], [4.94, 52.372]],
];
function ring(rx: number, ry: number): Line {
  const c: LngLat = [4.8945, 52.3745];
  const pts: Line = [];
  for (let a = 200; a <= 340; a += 10) {
    const r = (a * Math.PI) / 180;
    pts.push([c[0] + Math.cos(r) * rx, c[1] + Math.sin(r) * ry]);
  }
  return pts;
}
const CANALS: Line[] = [ring(0.008, 0.0048), ring(0.011, 0.0065), ring(0.0135, 0.008), ring(0.016, 0.0095), ring(0.0215, 0.0128)];
const MAJOR: Line[] = [
  [[4.84, 52.39], [4.828, 52.37], [4.834, 52.346], [4.86, 52.335], [4.9, 52.334], [4.94, 52.342], [4.956, 52.36], [4.951, 52.385], [4.93, 52.401], [4.89, 52.406], [4.858, 52.4], [4.84, 52.39]],
  [[4.86, 52.335], [4.8, 52.312], [4.75, 52.302]],
  [[4.9, 52.334], [4.905, 52.3]],
  [[4.956, 52.36], [5.0, 52.35]],
  [[4.828, 52.37], [4.78, 52.375]],
];
const MID: Line[] = [
  [[4.9, 52.379], [4.8935, 52.373], [4.8915, 52.366], [4.893, 52.355], [4.889, 52.34]],
  [[4.8805, 52.3622], [4.855, 52.358], [4.834, 52.356]],
  [[4.905, 52.3655], [4.916, 52.35], [4.92, 52.338]],
  [[4.888, 52.383], [4.86, 52.385], [4.83, 52.384]],
  [[4.872, 52.354], [4.912, 52.3545], [4.935, 52.356]],
  [[4.921, 52.3655], [4.932, 52.355], [4.95, 52.351]],
  [[4.9, 52.379], [4.93, 52.373], [4.952, 52.37]],
  [[4.875, 52.37], [4.85, 52.372], [4.83, 52.375]],
  [[4.902, 52.384], [4.903, 52.4], [4.905, 52.42]],
  [[4.885, 52.348], [4.885, 52.33]],
];
/** Light grid of minor streets so every part of the preview reads as city. */
const MINOR: Line[] = (() => {
  const out: Line[] = [];
  for (let lng = 4.83; lng <= 4.97; lng += 0.0042) out.push([[lng, 52.33], [lng + 0.003, 52.405]]);
  for (let lat = 52.332; lat <= 52.405; lat += 0.0026) out.push([[4.83, lat], [4.97, lat - 0.0012]]);
  return out;
})();

const LABELS: { name: string; at: LngLat; minZoom: number }[] = [
  { name: 'Centrum', at: [4.8945, 52.371], minZoom: 11 },
  { name: 'Jordaan', at: [4.881, 52.3765], minZoom: 13 },
  { name: 'De Pijp', at: [4.8945, 52.3535], minZoom: 13 },
  { name: 'Oost', at: [4.928, 52.362], minZoom: 12 },
  { name: 'Zuid', at: [4.868, 52.343], minZoom: 12 },
  { name: 'Noord', at: [4.915, 52.395], minZoom: 12 },
  { name: 'West', at: [4.858, 52.374], minZoom: 12 },
  { name: 'Schiphol', at: [4.7639, 52.3105], minZoom: 10 },
];

export const PreviewMap = forwardRef<HayveMapHandle, HayveMapProps>(function PreviewMap({ center: initialCenter = AMSTERDAM, zoom: initialZoom = 13, markers = [], cars = [], route, routeProgress = 0, fit, padding = NO_PADDING, userLocation, interactive = true, onMove, onIdle, style, accessibilityLabel }, ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reveal = useRouteReveal(route);
  const parts = routeParts(route, reveal, routeProgress);
  const [cam, setCam] = useState({ center: initialCenter, zoom: initialZoom });
  const camRef = useRef(cam);
  camRef.current = cam;
  const anim = useRef(0);
  const cb = useRef({ onMove, onIdle });
  cb.current = { onMove, onIdle };

  const animateTo = useCallback((center: LngLat, zoom: number) => {
    cancelAnimationFrame(anim.current);
    const from = camRef.current;
    const t0 = Date.now();
    const D = 600;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / D);
      const e = 1 - (1 - t) ** 3;
      const next = { center: [from.center[0] + (center[0] - from.center[0]) * e, from.center[1] + (center[1] - from.center[1]) * e] as LngLat, zoom: from.zoom + (zoom - from.zoom) * e };
      setCam(next);
      if (t < 1) anim.current = requestAnimationFrame(tick);
      else cb.current.onIdle?.(center, false);
    };
    anim.current = requestAnimationFrame(tick);
  }, []);

  const fitTo = useCallback(
    (pts: LngLat[]) => {
      if (!pts.length || !size.w) return;
      const pad = { top: padding.top + 56, bottom: padding.bottom + 56, left: padding.left + 56, right: padding.right + 56 };
      const z = Math.min(16, fitZoom(pts, size.w, size.h, pad));
      const ps = pts.map((p) => project(p, z));
      const cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
      const cy = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2;
      animateTo(unproject(cx, cy, z), z);
    },
    [size.w, size.h, padding.top, padding.bottom, padding.left, padding.right, animateTo],
  );

  useImperativeHandle(ref, () => ({ flyTo: (c, z) => animateTo(c, z ?? camRef.current.zoom), fitTo }), [animateTo, fitTo]);

  const fitKey = fit ? fit.map((p) => p.join(',')).join(';') : '';
  useEffect(() => {
    if (fit && fit.length) fitTo(fit);
  }, [fitKey, size.w, size.h, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Screen position of the padded viewport centre.
  const anchor = { x: padding.left + (size.w - padding.left - padding.right) / 2, y: padding.top + (size.h - padding.top - padding.bottom) / 2 };
  const origin = project(cam.center, cam.zoom);
  const toScreen = (p: LngLat) => {
    const q = project(p, cam.zoom);
    return { x: anchor.x + (q.x - origin.x), y: anchor.y + (q.y - origin.y) };
  };
  const path = (line: Line, close = false) => line.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p).x.toFixed(1)} ${toScreen(p).y.toFixed(1)}`).join(' ') + (close ? ' Z' : '');
  const k = 2 ** (cam.zoom - 14);

  const pan = useMemo(() => {
    let start = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder: (_, g) => interactive && Math.abs(g.dx) + Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        cancelAnimationFrame(anim.current);
        start = project(camRef.current.center, camRef.current.zoom);
      },
      onPanResponderMove: (_, g) => {
        const c = unproject(start.x - g.dx, start.y - g.dy, camRef.current.zoom);
        setCam((s) => ({ ...s, center: c }));
        cb.current.onMove?.(c);
      },
      onPanResponderRelease: () => cb.current.onIdle?.(camRef.current.center, true),
      onPanResponderTerminate: () => cb.current.onIdle?.(camRef.current.center, true),
    });
  }, [interactive]);

  const zoomBy = (d: number) => animateTo(camRef.current.center, Math.max(10, Math.min(17, camRef.current.zoom + d)));

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: C.land }, style]} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} accessibilityLabel={accessibilityLabel ?? 'Map'} {...pan.panHandlers}>
      {size.w > 0 && (
        <>
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }} pointerEvents="none">
            {PARKS.map((p, i) => (
              <Path key={`p${i}`} d={path(p, true)} fill={C.park} />
            ))}
            <Path d={path(IJ, true)} fill={C.water} />
            {CANALS.map((l, i) => (
              <Path key={`c${i}`} d={path(l)} stroke={C.water} strokeWidth={Math.max(1.5, 5 * k)} fill="none" strokeLinecap="round" />
            ))}
            <Path d={path(AMSTEL)} stroke={C.water} strokeWidth={Math.max(3, 11 * k)} fill="none" strokeLinecap="round" />
            {cam.zoom >= 13.5 && MINOR.map((l, i) => (
              <Path key={`n${i}`} d={path(l)} stroke={C.road} strokeOpacity={0.7} strokeWidth={Math.max(1, 3 * k)} fill="none" />
            ))}
            {MID.map((l, i) => (
              <Path key={`m${i}`} d={path(l)} stroke={C.road} strokeWidth={Math.max(2, 6 * k)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {MAJOR.map((l, i) => (
              <Path key={`M${i}`} d={path(l)} stroke={C.roadMajor} strokeWidth={Math.max(3, 9 * k)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {parts.done.length > 1 && <Path d={path(parts.done)} stroke={ROUTE_STYLE.done} strokeWidth={ROUTE_STYLE.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            {parts.todo.length > 1 && <Path d={path(parts.todo)} stroke={ROUTE_STYLE.casing} strokeWidth={ROUTE_STYLE.casingWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            {parts.todo.length > 1 && <Path d={path(parts.todo)} stroke={ROUTE_STYLE.line} strokeWidth={ROUTE_STYLE.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </Svg>
          {LABELS.filter((l) => cam.zoom >= l.minZoom).map((l) => {
            const s = toScreen(l.at);
            return (
              <Text key={l.name} pointerEvents="none" style={[{ position: 'absolute', left: s.x - 60, top: s.y - 8, width: 120, textAlign: 'center', fontSize: 12, color: C.label }, font('500')]}>
                {l.name}
              </Text>
            );
          })}
          {userLocation && <Positioned at={toScreen(userLocation)} w={40} h={40}><UserDot /></Positioned>}
          {cars.map((c) => (
            <PreviewCar key={c.id} car={c} toScreen={toScreen} />
          ))}
          {markers.map((m) => {
            const s = toScreen(m.coord);
            const content = <MarkerView m={m} />;
            return (
              <View key={m.id} pointerEvents="box-none" style={{ position: 'absolute', left: s.x - 100, width: 200, alignItems: 'center', ...(m.kind === 'price' ? { top: s.y - 15, height: 30 } : { top: s.y - 91, height: 100, justifyContent: 'flex-end' }) }}>
                {m.onPress ? <Pressable onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.label}>{content}</Pressable> : content}
              </View>
            );
          })}
          {interactive && (
            <View style={{ position: 'absolute', right: 12, top: padding.top + 12, borderRadius: 12, backgroundColor: color.white, borderWidth: 1, borderColor: color.grey200, overflow: 'hidden' }}>
              <ZoomBtn label="+" onPress={() => zoomBy(1)} a11y="Zoom in" />
              <View style={{ height: 1, backgroundColor: color.grey200 }} />
              <ZoomBtn label="−" onPress={() => zoomBy(-1)} a11y="Zoom out" />
            </View>
          )}
          <Text pointerEvents="none" style={[{ position: 'absolute', left: 8, bottom: padding.bottom + 6, fontSize: 10, color: C.label }, font('500')]}>
            Map preview
          </Text>
        </>
      )}
    </View>
  );
});

function ZoomBtn({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? color.grey100 : color.white })}>
      <Text style={[{ fontSize: 20, color: color.black }, font('500')]}>{label}</Text>
    </Pressable>
  );
}

function Positioned({ at, w, h, children }: { at: { x: number; y: number }; w: number; h: number; children: React.ReactNode }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: at.x - w / 2, top: at.y - h / 2, width: w, height: h }}>{children}</View>;
}

function PreviewCar({ car, toScreen }: { car: MapCar; toScreen: (p: LngLat) => { x: number; y: number } }) {
  const pose = useGlide(car);
  return (
    <Positioned at={toScreen(pose.coord)} w={34} h={34}>
      <CarGlyph heading={pose.heading} assigned={car.assigned} />
    </Positioned>
  );
}
