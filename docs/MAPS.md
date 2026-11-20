# Maps

Every map in Hayve goes through one component, `HayveMap` (`src/features/map`), so they all share the same style and behaviour.

| Platform | Renderer |
|---|---|
| Web | Mapbox GL JS (`mapbox-gl`) |
| iOS / Android with a Mapbox token | Mapbox Maps SDK (`@rnmapbox/maps`) |
| iPhone / iPad without a token | **Apple Maps** (`react-native-maps`, "muted standard" style), free and no key |
| Web, fallback only | MapLibre GL + MapTiler (`EXPO_PUBLIC_MAPTILER_KEY`) |
| No key configured | Built-in vector preview of Amsterdam (real coordinates, same colours). Not a tile server, not an image. |

Search and reverse geocoding use the Mapbox Geocoding API v6. Routes use Mapbox Directions (`driving-traffic`). On iPhone without a token, a small native module (`modules/hayve-apple-maps`) uses Apple's MKDirections (real road routes and ETAs), CLGeocoder (nearest address) and MKLocalSearch (place search), all free. On the web without any key, Ride uses offline estimates so the flow still works.

### Why not Google Maps or Apple Maps on the web?

Both need a key there too: Google Maps JavaScript needs a Google Cloud key with billing, Apple MapKit JS needs an Apple Developer account and a signed token. Mapbox's free tier is the simplest key to get and gives the most control over the Hayve style. Apple Maps is used on iPhone because it needs no key at all.

## Keys

Keys live in environment variables only, never in the code:

```
EXPO_PUBLIC_MAPBOX_TOKEN=pk....          # public token
EXPO_PUBLIC_MAPBOX_STYLE_URL=            # optional, mapbox://styles/<user>/<id>
EXPO_PUBLIC_MAPTILER_KEY=                # optional web fallback
```

`EXPO_PUBLIC_*` values are built into the app, so use a **public** token and restrict it in the Mapbox dashboard (URL restrictions for the website). For GitHub builds add repository secrets `MAPBOX_PUBLIC_TOKEN` (and optionally `MAPBOX_STYLE_URL`); both workflows pass them in.

The Mapbox iOS SDK v11 no longer needs a secret download token.

## The Hayve style

Defined in `src/features/map/style.ts` for Mapbox Streets v8 tiles, with the same palette for the MapTiler fallback:

| Element | Colour |
|---|---|
| Land | `#FFFFFF` |
| Parks, buildings | `#F4F4F6` |
| Water, roads | `#E5E6EA` |
| Labels | `#6B6E78` with a white halo, only roads and neighbourhoods |
| Route | `#4F46E5` (Hayve indigo, like the logo wave) on a white casing; the driven part turns grey |
| Your location, selected items | `#4F46E5` (drawn on top of the map, never in the style) |

To use Mapbox Studio instead, recreate these colours, publish the style and set `EXPO_PUBLIC_MAPBOX_STYLE_URL`.

## Ride

- Fixed centre pin. The pickup address updates live as you move the map and snaps to the nearest address when you stop. The pin shows the nearest car's ETA.
- Route along real roads (Mapbox Directions or Apple MKDirections). The indigo Hayve route draws itself in from the pickup, sits on a white casing so it stands out, and the part already driven turns grey. Pins: "Pickup · 3 min" and "Arrive 21:40". The camera fits both pins above the bottom sheet.
- Cars are drawn top-down, rotate to their heading and glide between updates (reduced motion: no gliding).
- Draggable bottom sheet: choose ride → finding driver → driver arriving → on trip → arrived.
- Re-centre button and an indigo current-location dot (`expo-location`, asked once).
