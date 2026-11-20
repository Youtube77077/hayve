import { Platform } from 'react-native';

/** Public website address used in shared links on iPhone/Android (the web uses its own origin). */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://hayve.app').replace(/\/$/, '');

export function publicUrl(path: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${path}`;
  return `${SITE_URL}${path}`;
}

/** The link someone opens to pay a request. */
export const requestLink = (id: string) => publicUrl(`/r/${id}`);
