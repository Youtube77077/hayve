import type { Place } from './types';

/** Places on the stylised Amsterdam map used by Ride, Bites and Send. */
export const PLACES: Place[] = [
  { id: 'centraal', name: 'Amsterdam Centraal', address: 'Stationsplein, 1012 AB', x: 0.52, y: 0.33 },
  { id: 'dam', name: 'Dam Square', address: 'Dam, 1012 JS', x: 0.48, y: 0.42 },
  { id: 'rijks', name: 'Rijksmuseum', address: 'Museumstraat 1, 1071 XX', x: 0.44, y: 0.64 },
  { id: 'vondel', name: 'Vondelpark', address: 'Vondelpark, 1071 AA', x: 0.33, y: 0.66 },
  { id: 'pijp', name: 'De Pijp', address: 'Albert Cuypstraat, 1072 CT', x: 0.55, y: 0.7 },
  { id: 'jordaan', name: 'Jordaan', address: 'Westerstraat 120, 1015 MN', x: 0.38, y: 0.4 },
  { id: 'zuid', name: 'Amsterdam Zuid', address: 'Zuidplein, 1077 XV', x: 0.45, y: 0.86 },
  { id: 'ndsm', name: 'NDSM Wharf', address: 'NDSM-Plein 28, 1033 WB', x: 0.3, y: 0.14 },
  { id: 'amstel', name: 'Amstel Station', address: 'Julianaplein 1, 1097 DN', x: 0.74, y: 0.78 },
  { id: 'westerpark', name: 'Westerpark', address: 'Haarlemmerweg 8, 1014 BE', x: 0.24, y: 0.32 },
  { id: 'noord', name: 'Buiksloterweg', address: 'Buiksloterweg 5, 1031 CC', x: 0.56, y: 0.2 },
  { id: 'oost', name: 'Oosterpark', address: "s-Gravesandestraat, 1092 AA", x: 0.7, y: 0.58 },
  { id: 'schiphol', name: 'Schiphol Airport', address: 'Evert van de Beekstraat 202', x: 0.08, y: 0.94 },
  { id: 'home', name: 'Home', address: 'Cornelis Dirkszoonlaan 51', x: 0.62, y: 0.5 },
  { id: 'work', name: 'Studio', address: 'Reijnier Vinkeleskade 62', x: 0.4, y: 0.8 },
];

export function placeById(id: string) {
  return PLACES.find((p) => p.id === id);
}

/** Approximate road distance in km between two map points (Amsterdam is ~16 km across). */
export function distanceKm(a: Place, b: Place) {
  const dx = (a.x - b.x) * 16;
  const dy = (a.y - b.y) * 14;
  return Math.max(0.8, Math.round(Math.hypot(dx, dy) * 1.3 * 10) / 10);
}
