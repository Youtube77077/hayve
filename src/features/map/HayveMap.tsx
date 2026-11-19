import Mapbox, { Camera, LineLayer, MapView, MarkerView as RNMarkerView, ShapeSource } from '@rnmapbox/maps';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN, mapProvider } from './config';
import { AMSTERDAM, bounds, type LngLat } from './geo';
import { CarGlyph, MarkerView, useGlide, UserDot } from './markers';
import { PreviewMap } from './PreviewMap';
import { hayveMapboxStyle, MAP_COLORS } from './style';
import { type HayveMapHandle, type HayveMapProps, type MapCar, NO_PADDING } from './types';

if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);
const STYLE_JSON = JSON.stringify(hayveMapboxStyle());

/** iOS/Android map: Mapbox Maps SDK (@rnmapbox/maps); built-in preview when no token is set. */
export const HayveMap = forwardRef<HayveMapHandle, HayveMapProps>(function HayveMap(props, ref) {
  if (mapProvider('native') !== 'mapbox') return <PreviewMap ref={ref} {...props} />;
  return <NativeMap ref={ref} {...props} />;
});

const NativeMap = forwardRef<HayveMapHandle, HayveMapProps>(function NativeMap({ center = AMSTERDAM, zoom = 13, markers = [], cars = [], route, fit, padding = NO_PADDING, userLocation, interactive = true, onMove, onIdle, style, accessibilityLabel }, ref) {
  const camera = useRef<Camera>(null);
  const userMoving = useRef(false);

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
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shape = useMemo(() => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route && route.length > 1 ? route : [] } }), [route]);

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
        {route && route.length > 1 && (
          <ShapeSource id="hayve-route" shape={shape}>
            <LineLayer id="hayve-route-line" style={{ lineColor: MAP_COLORS.route, lineWidth: 5, lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}
        {userLocation && (
          <RNMarkerView coordinate={userLocation} allowOverlap>
            <UserDot />
          </RNMarkerView>
        )}
        {cars.map((c) => (
          <NativeCar key={c.id} car={c} />
        ))}
        {markers.map((m) => (
          <RNMarkerView key={m.id} coordinate={m.coord} anchor={m.kind === 'price' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.92 }} allowOverlap>
            {m.onPress ? (
              <Pressable onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.label}>
                <MarkerView m={m} />
              </Pressable>
            ) : (
              <MarkerView m={m} />
            )}
          </RNMarkerView>
        ))}
      </MapView>
    </View>
  );
});

function NativeCar({ car }: { car: MapCar }) {
  const pose = useGlide(car, 30);
  return (
    <RNMarkerView coordinate={pose.coord} allowOverlap>
      <CarGlyph heading={pose.heading} assigned={car.assigned} />
    </RNMarkerView>
  );
}
