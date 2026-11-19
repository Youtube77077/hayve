import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/**
 * Hayve design tokens — "Ultraviolet & Lime".
 * Ultraviolet leads; dark purple gives premium contrast; lime is reserved for
 * key actions, selected states and success. Never introduce new brand colours
 * here — service accents are used only as small tints.
 */
export const color = {
  primary: '#3A1FD1',
  primaryPressed: '#2C15A8',
  primarySoft: '#ECE8FF',
  primaryTint: '#D9D1FF',
  ink: '#110D2E',
  inkSoft: '#2A2550',
  text: '#110D2E',
  textSecondary: '#55507A',
  textTertiary: '#8C88A8',
  textOnDark: '#FFFFFF',
  textOnDarkSecondary: '#B9B4DA',
  lime: '#C8F542',
  limePressed: '#B5E22F',
  limeSoft: '#F1FCD2',
  limeInk: '#2B3A00',
  bg: '#F6F5FF',
  surface: '#FFFFFF',
  surfaceSunken: '#EFEDFB',
  line: '#E5E2F4',
  lineStrong: '#CFCAE6',
  danger: '#D93B4A',
  dangerSoft: '#FDEBED',
  warning: '#B26B00',
  warningSoft: '#FFF3DB',
  success: '#2F7A12',
  successSoft: '#EAF8D6',
  overlay: 'rgba(17,13,46,0.45)',
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  card: {
    shadowColor: '#110D2E',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#110D2E',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

export type IconName = ComponentProps<typeof Ionicons>['name'];

export type ServiceKey = 'home' | 'explore' | 'shop' | 'pay' | 'ride' | 'bites' | 'drive' | 'stay' | 'send' | 'profile';

export interface ServiceMeta {
  key: ServiceKey;
  name: string;
  short: string;
  route: string;
  icon: IconName;
  iconActive: IconName;
  accent: string;
  tagline: string;
}

/** The ten primary Hayve destinations. Order = navigation order. */
export const SERVICES: ServiceMeta[] = [
  { key: 'home', name: 'Hayve', short: 'Home', route: '/', icon: 'home-outline', iconActive: 'home', accent: color.primary, tagline: 'Everything, connected' },
  { key: 'explore', name: 'Explore', short: 'Explore', route: '/explore', icon: 'compass-outline', iconActive: 'compass', accent: color.primary, tagline: 'Discover the ecosystem' },
  { key: 'shop', name: 'Hayve Shop', short: 'Shop', route: '/shop', icon: 'bag-handle-outline', iconActive: 'bag-handle', accent: '#3A1FD1', tagline: 'Buy and sell anything' },
  { key: 'pay', name: 'Hayve Pay', short: 'Pay', route: '/pay', icon: 'wallet-outline', iconActive: 'wallet', accent: '#110D2E', tagline: 'Your wallet' },
  { key: 'ride', name: 'Hayve Ride', short: 'Ride', route: '/ride', icon: 'car-sport-outline', iconActive: 'car-sport', accent: '#110D2E', tagline: 'Get there' },
  { key: 'bites', name: 'Hayve Bites', short: 'Bites', route: '/bites', icon: 'fast-food-outline', iconActive: 'fast-food', accent: '#E8502E', tagline: 'Food & groceries' },
  { key: 'drive', name: 'Hayve Drive', short: 'Drive', route: '/drive', icon: 'key-outline', iconActive: 'key', accent: '#0E8F7E', tagline: 'Rent a car' },
  { key: 'stay', name: 'Hayve Stay', short: 'Stay', route: '/stay', icon: 'bed-outline', iconActive: 'bed', accent: '#D63D74', tagline: 'Places to stay' },
  { key: 'send', name: 'Hayve Send', short: 'Send', route: '/send', icon: 'cube-outline', iconActive: 'cube', accent: '#C98500', tagline: 'Send a parcel' },
  { key: 'profile', name: 'Profile', short: 'Profile', route: '/profile', icon: 'person-circle-outline', iconActive: 'person-circle', accent: color.primary, tagline: 'You' },
];

export const service = (key: ServiceKey) => SERVICES.find((s) => s.key === key)!;

/** Adds alpha to a #RRGGBB colour. */
export function alpha(hex: string, a: number) {
  const n = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${n}`;
}

export const layout = {
  maxContent: 1180,
  sidebar: 264,
  wide: 768,
  desktop: 1100,
};
