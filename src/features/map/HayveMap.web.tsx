import 'mapbox-gl/dist/mapbox-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, View } from 'react-native';
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN, MAPTILER_KEY, mapProvider } from './config';
import { AMSTERDAM, bounds, type LngLat } from './geo';
import { CarGlyph, MarkerView, useGlide, UserDot } from './markers';
import { PreviewMap } from './PreviewMap';
import { hayveMapboxStyle, hayveMaplibreStyle, MAP_COLORS } from './style';
import { type HayveMapHandle, type HayveMapProps, type MapCar, type MapMarker, NO_PADDING } from './types';

type GL = any;
type GLMap = any;

/** Web map: Mapbox GL JS, MapLibre + MapTiler as fallback, built-in preview without keys. */
export const HayveMap = forwardRef<HayveMapHandle, HayveMapProps>(function HayveMap(props, ref) {
  const provider = mapProvider('web');
  if (provider === 'preview') return <PreviewMap ref={ref} {...props} />;
  return <GLHayveMap ref={ref} provider={provider} {...props} />;
});

const GLHayveMap = forwardRef<HayveMapHandle, HayveMapProps & { provider: 'mapbox' | 'maplibre' }>(function GLHayveMap({ provider, center = AMSTERDAM, zoom = 13, markers = [], cars = [], route, fit, padding = NO_PADDING, userLocation, interactive = true, onMove, onIdle, style, accessibilityLabel }, ref) {
  const host = useRef<any>(null);
  const [gl, setGl] = useState<GL>(null);
  const [map, setMap] = useState<GLMap>(null);
  const cb = useRef({ onMove, onIdle });
  cb.current = { onMove, onIdle };
  const padRef = useRef(padding);
  padRef.current = padding;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib: GL = provider === 'mapbox' ? require('mapbox-gl') : require('maplibre-gl');
    const g = lib.default ?? lib;
    if (provider === 'mapbox') g.accessToken = MAPBOX_TOKEN;
    const m = new g.Map({
      container: host.current,
      style: provider === 'mapbox' ? MAPBOX_STYLE_URL || hayveMapboxStyle() : hayveMaplibreStyle(MAPTILER_KEY),
      center,
      zoom,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      interactive,
      cooperativeGestures: false,
    });
    m.touchZoomRotate?.disableRotation?.();
    m.on('load', () => {
      m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_COLORS.route, 'line-width': 5 } });
      setMap(m);
    });
    m.on('move', () => {
      const c = m.getCenter();
      cb.current.onMove?.([c.lng, c.lat]);
    });
    m.on('moveend', (e: any) => {
      const c = m.getCenter();
      cb.current.onIdle?.([c.lng, c.lat], !!e.originalEvent);
    });
    setGl(g);
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    map?.setPadding(padding);
  }, [map, padding.top, padding.bottom, padding.left, padding.right]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const src = map?.getSource('route');
    src?.setData(route && route.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } : { type: 'FeatureCollection', features: [] });
  }, [map, route]);

  const fitTo = (pts: LngLat[]) => {
    if (!map || !pts.length) return;
    if (pts.length === 1) return map.easeTo({ center: pts[0], zoom: 15, duration: 600 });
    map.fitBounds(bounds(pts), { padding: 56, duration: 700, maxZoom: 16 });
  };
  useImperativeHandle(ref, () => ({ flyTo: (c, z) => map?.easeTo({ center: c, zoom: z ?? map.getZoom(), duration: 600 }), fitTo }));

  const fitKey = fit ? fit.map((p) => p.join(',')).join(';') : '';
  useEffect(() => {
    if (fit && fit.length) fitTo(fit);
  }, [map, fitKey, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: MAP_COLORS.land }, style]} accessibilityLabel={accessibilityLabel ?? 'Map'}>
      <View ref={host} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {map && gl && (
        <>
          {userLocation && <DomMarker gl={gl} map={map} coord={userLocation} anchor="center"><UserDot /></DomMarker>}
          {cars.map((c) => (
            <GLCar key={c.id} gl={gl} map={map} car={c} />
          ))}
          {markers.map((m) => (
            <DomMarker key={m.id} gl={gl} map={map} coord={m.coord} anchor={m.kind === 'price' ? 'center' : 'bottom'} offsetY={m.kind === 'price' ? 0 : 9}>
              <MarkerContent m={m} />
            </DomMarker>
          ))}
        </>
      )}
    </View>
  );
});

function MarkerContent({ m }: { m: MapMarker }) {
  const content = <MarkerView m={m} />;
  return m.onPress ? <Pressable onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.label}>{content}</Pressable> : content;
}

function DomMarker({ gl, map, coord, anchor, offsetY = 0, children }: { gl: GL; map: GLMap; coord: LngLat; anchor: 'center' | 'bottom'; offsetY?: number; children: React.ReactNode }) {
  const [el] = useState(() => document.createElement('div'));
  const marker = useRef<any>(null);
  useEffect(() => {
    marker.current = new gl.Marker({ element: el, anchor, offset: [0, offsetY] }).setLngLat(coord).addTo(map);
    return () => marker.current?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, map, el, anchor, offsetY]);
  useEffect(() => {
    marker.current?.setLngLat(coord);
  }, [coord]);
  return createPortal(children, el);
}

function GLCar({ gl, map, car }: { gl: GL; map: GLMap; car: MapCar }) {
  const pose = useGlide(car);
  return (
    <DomMarker gl={gl} map={map} coord={pose.coord} anchor="center">
      <CarGlyph heading={pose.heading} assigned={car.assigned} />
    </DomMarker>
  );
}
