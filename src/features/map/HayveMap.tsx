import Mapbox, { Camera, LineLayer, MapView, MarkerView as RNMarkerView, ShapeSource } from '@rnmapbox/maps';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import AppleMapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN, mapProvider } from './config';
import { AMSTERDAM, bounds, type LngLat } from './geo';
import { CarGlyph, MarkerView, useGlide, UserDot } from './markers';
import { PreviewMap } from './PreviewMap';
import { ROUTE_STYLE, routeParts, useRouteReveal } from './route';
import { hayveMapboxStyle, MAP_COLORS } from './style';
import { type HayveMapHandle, type HayveMapProps, type MapCar, type MapMarker, NO_PADDING } from './types';

if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);
const STYLE_JSON = JSON.stringify(hayveMapboxStyle());

/**
 * iOS/Android map. Mapbox Maps SDK when a token is configured; on iPhone/iPad without a token,
 * Apple Maps (free, no key). Android without a token uses the built-in preview.
 */
export const HayveMap = forwardRef<HayveMapHandle, HayveMapProps>(function HayveMap(props, ref) {
  const provider = mapProvider(Platform.OS === 'ios' ? 'ios' : 'android');
  if (provider === 'mapbox') return <NativeMapbox ref={ref} {...props} />;
  if (provider === 'apple') return <AppleMap ref={ref} {...props} />;
  return <PreviewMap ref={ref} {...props} />;
});

/* ------------------------------------------------------------- Mapbox -- */

const NativeMapbox = forwardRef<HayveMapHandle, HayveMapProps>(function NativeMapbox({ center = AMSTERDAM, zoom = 13, markers = [], cars = [], route, routeProgress = 0, fit, padding = NO_PADDING, userLocation, interactive = true, onMove, onIdle, style, accessibilityLabel }, ref) {
  const camera = useRef<Camera>(null);
  const userMoving = useRef(false);
  const reveal = useRouteReveal(route);
  const parts = useMemo(() => routeParts(route, reveal, routeProgress), [route, reveal, routeProgress]);

  const fitTo = (pts: LngLat[]) => {
    if (!pts.length) return;
    if (pts.length === 1) return camera.current?.setCamera({ centerCoordinate: pts[0], zoomLevel: 15, animationDuration: 600 });
    const [sw, ne] = bounds(pts);
    camera.current?.fitBounds(ne, sw, [padding.top + 56, padding.right + 56, padding.bottom + 56, padding.left + 56], 700);
  };
  useImperativeHandle(ref, () => ({ flyTo: (c, z) => camera.current?.setCamera({ centerCoordinate: c, zoomLevel: z, animationDuration: 600 }), fitTo }));

  const fitKey = fit ? fit.map((p) => p.join(',')).join(';') : '';
  useEffect(() => {
    if (fit && fit.length) fitTo(fit);
  }, [fitKey, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  const line = (coords: LngLat[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords.length > 1 ? coords : [] } });

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: MAP_COLORS.land }, style]} accessibilityLabel={accessibilityLabel ?? 'Map'}>
      <MapView
        style={{ flex: 1 }}
        styleURL={MAPBOX_STYLE_URL || undefined}
        styleJSON={MAPBOX_STYLE_URL ? undefined : STYLE_JSON}
        scaleBarEnabled={false}
        compassEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        onCameraChanged={(s) => {
          userMoving.current = s.gestures.isGestureActive || userMoving.current;
          onMove?.(s.properties.center as LngLat);
        }}
        onMapIdle={(s) => {
          onIdle?.(s.properties.center as LngLat, userMoving.current);
          userMoving.current = false;
        }}
      >
        <Camera ref={camera} defaultSettings={{ centerCoordinate: center, zoomLevel: zoom }} padding={{ paddingTop: padding.top, paddingBottom: padding.bottom, paddingLeft: padding.left, paddingRight: padding.right }} />
        {parts.done.length > 1 && (
          <ShapeSource id="hayve-route-done" shape={line(parts.done)}>
            <LineLayer id="hayve-route-done-line" style={{ lineColor: ROUTE_STYLE.done, lineWidth: ROUTE_STYLE.width, lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}
        {parts.todo.length > 1 && (
          <ShapeSource id="hayve-route" shape={line(parts.todo)}>
            <LineLayer id="hayve-route-casing" style={{ lineColor: ROUTE_STYLE.casing, lineWidth: ROUTE_STYLE.casingWidth, lineCap: 'round', lineJoin: 'round' }} />
            <LineLayer id="hayve-route-line" style={{ lineColor: ROUTE_STYLE.line, lineWidth: ROUTE_STYLE.width, lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}
        {userLocation && (
          <RNMarkerView coordinate={userLocation} allowOverlap>
            <UserDot />
          </RNMarkerView>
        )}
        {cars.map((c) => (
          <MapboxCar key={c.id} car={c} />
        ))}
        {markers.map((m) => (
          <RNMarkerView key={m.id} coordinate={m.coord} anchor={m.kind === 'price' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.92 }} allowOverlap>
            <MarkerContent m={m} />
          </RNMarkerView>
        ))}
      </MapView>
    </View>
  );
});

function MapboxCar({ car }: { car: MapCar }) {
  const pose = useGlide(car, 30);
  return (
    <RNMarkerView coordinate={pose.coord} allowOverlap>
      <CarGlyph heading={pose.heading} assigned={car.assigned} />
    </RNMarkerView>
  );
}

function MarkerContent({ m }: { m: MapMarker }) {
  return m.onPress ? (
    <Pressable onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.label}>
      <MarkerView m={m} />
    </Pressable>
  ) : (
    <MarkerView m={m} />
  );
}

/* --------------------------------------------------------- Apple Maps -- */

const ll = ([lng, lat]: LngLat) => ({ latitude: lat, longitude: lng });

/**
 * Apple Maps renderer. "mutedStandard" is Apple's quiet, low-colour map that suits the Hayve
 * palette; points of interest, buildings and traffic are switched off. The padded centre maths
 * keeps the fixed pickup pin accurate above the bottom sheet.
 */
const AppleMap = forwardRef<HayveMapHandle, HayveMapProps>(function AppleMap({ center = AMSTERDAM, zoom = 13, markers = [], cars = [], route, routeProgress = 0, fit, padding = NO_PADDING, userLocation, interactive = true, onMove, onIdle, style, accessibilityLabel }, ref) {
  const map = useRef<AppleMapView>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const region = useRef<Region | null>(null);
  const programmatic = useRef(false);
  const reveal = useRouteReveal(route);
  const parts = useMemo(() => routeParts(route, reveal, routeProgress), [route, reveal, routeProgress]);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const padRef = useRef(padding);
  padRef.current = padding;

  const initialRegion = useMemo<Region>(() => {
    const lngDelta = (360 / 2 ** zoom) * 1.6;
    return { latitude: center[1], longitude: center[0], latitudeDelta: lngDelta * 0.62, longitudeDelta: lngDelta };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Map centre of the padded viewport (where the fixed pin sits).
  const paddedCenter = (r: Region): LngLat => {
    const { w, h } = sizeRef.current;
    const p = padRef.current;
    if (!w || !h) return [r.longitude, r.latitude];
    const px = p.left + (w - p.left - p.right) / 2;
    const py = p.top + (h - p.top - p.bottom) / 2;
    return [r.longitude + ((px - w / 2) / w) * r.longitudeDelta, r.latitude - ((py - h / 2) / h) * r.latitudeDelta];
  };

  const flyTo = (c: LngLat, z?: number) => {
    const r = region.current ?? initialRegion;
    const lngDelta = z ? (360 / 2 ** z) * 1.6 : r.longitudeDelta;
    const latDelta = z ? lngDelta * 0.62 : r.latitudeDelta;
    const { w, h } = sizeRef.current;
    const p = padRef.current;
    // Shift the region so `c` lands on the padded centre.
    const dx = w ? ((p.left - p.right) / 2 / w) * lngDelta : 0;
    const dy = h ? ((p.top - p.bottom) / 2 / h) * latDelta : 0;
    programmatic.current = true;
    map.current?.animateToRegion({ longitude: c[0] - dx, latitude: c[1] + dy, longitudeDelta: lngDelta, latitudeDelta: latDelta }, 600);
  };
  const fitTo = (pts: LngLat[]) => {
    if (!pts.length) return;
    if (pts.length === 1) return flyTo(pts[0], 15);
    programmatic.current = true;
    const p = padRef.current;
    map.current?.fitToCoordinates(pts.map(ll), { edgePadding: { top: p.top + 56, right: p.right + 56, bottom: p.bottom + 56, left: p.left + 56 }, animated: true });
  };
  useImperativeHandle(ref, () => ({ flyTo, fitTo }));

  const fitKey = fit ? fit.map((p) => p.join(',')).join(';') : '';
  useEffect(() => {
    if (fit && fit.length && size.w) fitTo(fit);
  }, [fitKey, size.w, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: MAP_COLORS.land }, style]} accessibilityLabel={accessibilityLabel ?? 'Map'} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <AppleMapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        mapType="mutedStandard"
        userInterfaceStyle="light"
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsCompass={false}
        showsScale={false}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        legalLabelInsets={{ top: 0, left: 12, bottom: padding.bottom + 8, right: 0 }}
        onRegionChange={(r) => {
          region.current = r;
          onMove?.(paddedCenter(r));
        }}
        onRegionChangeComplete={(r, details) => {
          region.current = r;
          const byUser = details?.isGesture ?? !programmatic.current;
          programmatic.current = false;
          onIdle?.(paddedCenter(r), byUser);
        }}
      >
        {parts.done.length > 1 && <Polyline coordinates={parts.done.map(ll)} strokeColor={ROUTE_STYLE.done} strokeWidth={ROUTE_STYLE.width} lineCap="round" lineJoin="round" />}
        {parts.todo.length > 1 && <Polyline coordinates={parts.todo.map(ll)} strokeColor={ROUTE_STYLE.casing} strokeWidth={ROUTE_STYLE.casingWidth} lineCap="round" lineJoin="round" />}
        {parts.todo.length > 1 && <Polyline coordinates={parts.todo.map(ll)} strokeColor={ROUTE_STYLE.line} strokeWidth={ROUTE_STYLE.width} lineCap="round" lineJoin="round" />}
        {userLocation && (
          <Marker coordinate={ll(userLocation)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <UserDot />
          </Marker>
        )}
        {cars.map((c) => (
          <AppleCar key={c.id} car={c} />
        ))}
        {markers.map((m) => (
          <Marker key={`${m.id}:${m.label ?? ''}:${m.selected ? 1 : 0}`} coordinate={ll(m.coord)} anchor={m.kind === 'price' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.92 }} onPress={m.onPress} tracksViewChanges={false}>
            <MarkerView m={m} />
          </Marker>
        ))}
      </AppleMapView>
    </View>
  );
});

function AppleCar({ car }: { car: MapCar }) {
  const pose = useGlide(car, 30);
  return (
    <Marker coordinate={ll(pose.coord)} anchor={{ x: 0.5, y: 0.5 }} flat tracksViewChanges>
      <CarGlyph heading={pose.heading} assigned={car.assigned} />
    </Marker>
  );
}
