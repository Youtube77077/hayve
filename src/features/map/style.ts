/**
 * The Hayve map style: white land, light-grey parks and water, soft grey roads,
 * minimal grey labels. Indigo is reserved for the user's location and selected
 * items, which are drawn on top of the style (never in it).
 *
 * The same palette is generated for two vector-tile schemas:
 *  - Mapbox Streets v8 (primary, Mapbox GL JS on web and the Maps SDK on iOS/Android)
 *  - OpenMapTiles via MapTiler (fallback only, MapLibre GL on web)
 *
 * A style published from Mapbox Studio can replace this with EXPO_PUBLIC_MAPBOX_STYLE_URL;
 * docs/MAPS.md lists the exact colours so Studio matches the app.
 */

export const MAP_COLORS = {
  land: '#FFFFFF',
  park: '#F4F4F6',
  water: '#E5E6EA',
  building: '#F4F4F6',
  road: '#E5E6EA',
  roadMajor: '#E5E6EA',
  roadCasing: '#E5E6EA',
  label: '#6B6E78',
  labelHalo: '#FFFFFF',
  route: '#4F46E5',
  user: '#4F46E5',
} as const;

type Layer = Record<string, unknown>;
const C = MAP_COLORS;

const width = (base: number) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, base * 0.4, 14, base, 18, base * 6];

function mapboxLayers(): Layer[] {
  const road = (id: string, classes: string[], w: number, color: string, minzoom = 0): Layer => ({
    id,
    type: 'line',
    source: 'composite',
    'source-layer': 'road',
    minzoom,
    filter: ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'structure'], 'tunnel']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': width(w) },
  });
  return [
    { id: 'land', type: 'background', paint: { 'background-color': C.land } },
    { id: 'landuse', type: 'fill', source: 'composite', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['park', 'pitch', 'grass', 'cemetery', 'wood', 'scrub', 'agriculture'], true, false], paint: { 'fill-color': C.park } },
    { id: 'water', type: 'fill', source: 'composite', 'source-layer': 'water', paint: { 'fill-color': C.water } },
    { id: 'waterway', type: 'line', source: 'composite', 'source-layer': 'waterway', minzoom: 12, paint: { 'line-color': C.water, 'line-width': width(2) } },
    { id: 'building', type: 'fill', source: 'composite', 'source-layer': 'building', minzoom: 15, paint: { 'fill-color': C.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 1] } },
    road('road-minor', ['street', 'street_limited', 'service', 'pedestrian'], 3, C.road, 13),
    road('road-mid', ['secondary', 'tertiary'], 5, C.road, 11),
    road('road-major', ['motorway', 'trunk', 'primary'], 7, C.roadMajor, 6),
    {
      id: 'road-label',
      type: 'symbol',
      source: 'composite',
      'source-layer': 'road',
      minzoom: 13,
      filter: ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'street'], true, false],
      layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 11, 'text-letter-spacing': 0.02 },
      paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.5 },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'composite',
      'source-layer': 'place_label',
      filter: ['match', ['get', 'class'], ['settlement', 'settlement_subdivision'], true, false],
      layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 13], 'text-max-width': 8 },
      paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.5 },
    },
  ];
}

/** Hayve style for Mapbox (Streets v8 tiles). */
export function hayveMapboxStyle(): Record<string, unknown> {
  return {
    version: 8,
    name: 'Hayve',
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    sources: { composite: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' } },
    layers: mapboxLayers(),
  };
}

/** Same look for MapLibre + MapTiler (OpenMapTiles schema). Fallback only. */
export function hayveMaplibreStyle(key: string): Record<string, unknown> {
  const road = (id: string, classes: string[], w: number, minzoom = 0): Layer => ({
    id,
    type: 'line',
    source: 'omt',
    'source-layer': 'transportation',
    minzoom,
    filter: ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': C.road, 'line-width': width(w) },
  });
  return {
    version: 8,
    name: 'Hayve (fallback)',
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${encodeURIComponent(key)}`,
    sources: { omt: { type: 'vector', url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${encodeURIComponent(key)}` } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': C.park } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['grass', 'wood'], true, false], paint: { 'fill-color': C.park } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 15, paint: { 'fill-color': C.building } },
      road('road-minor', ['minor', 'service'], 3, 13),
      road('road-mid', ['secondary', 'tertiary'], 5, 11),
      road('road-major', ['motorway', 'trunk', 'primary'], 7, 6),
      {
        id: 'road-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 13,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town', 'suburb', 'neighbourhood'], true, false],
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
        paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.5 },
      },
    ],
  };
}
