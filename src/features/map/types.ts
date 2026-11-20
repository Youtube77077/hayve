import type { StyleProp, ViewStyle } from 'react-native';
import type { LngLat } from './geo';

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapMarker {
  id: string;
  coord: LngLat;
  kind: 'pickup' | 'dropoff' | 'stop' | 'price' | 'pin';
  label?: string;
  selected?: boolean;
  onPress?: () => void;
}

export interface MapCar {
  id: string;
  coord: LngLat;
  /** Heading in degrees, 0 = north. */
  heading: number;
  /** The assigned driver (drawn in black). */
  assigned?: boolean;
}

export interface HayveMapProps {
  center?: LngLat;
  zoom?: number;
  markers?: MapMarker[];
  cars?: MapCar[];
  /** Route line drawn in Hayve indigo along the roads (draws itself in, white casing). */
  route?: LngLat[] | null;
  /** 0..1 of the route already travelled (drawn grey). */
  routeProgress?: number;
  /** When this changes the camera fits these points (with `padding`). */
  fit?: LngLat[] | null;
  padding?: MapPadding;
  /** The user's own location: the only indigo element besides selected items. */
  userLocation?: LngLat | null;
  interactive?: boolean;
  /** Fires while the map moves (center of the padded viewport). */
  onMove?: (center: LngLat) => void;
  /** Fires when the camera settles. `byUser` is false after programmatic moves. */
  onIdle?: (center: LngLat, byUser: boolean) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export interface HayveMapHandle {
  flyTo: (center: LngLat, zoom?: number) => void;
  fitTo: (points: LngLat[]) => void;
}

export const NO_PADDING: MapPadding = { top: 0, right: 0, bottom: 0, left: 0 };
