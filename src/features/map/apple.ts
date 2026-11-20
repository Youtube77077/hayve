import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { LngLat } from './geo';

/** Apple Maps services from the native module in modules/hayve-apple-maps (iOS only, no key). */
interface AppleMapsNative {
  route(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<{ coordinates: LngLat[]; distance: number; duration: number }>;
  reverseGeocode(lat: number, lng: number): Promise<{ name: string; address: string; lat: number; lng: number }>;
  search(query: string, lat: number, lng: number): Promise<{ name: string; address: string; lat: number; lng: number }[]>;
}

export const appleMaps: AppleMapsNative | null = Platform.OS === 'ios' ? requireOptionalNativeModule<AppleMapsNative>('HayveAppleMaps') : null;
