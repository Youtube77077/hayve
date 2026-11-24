import type { TextStyle } from 'react-native';
import type { IconName } from './icons';


/**
 * Hayve design tokens.
 *
 * Only these colours exist in the product:
 *   Indigo #4F46E5 — brand: logo wave, primary buttons, active states, links, balance.
 *   Black  #0E0E10 — text, icons, secondary buttons.
 *   White  #FFFFFF — main background.
 *   Greys  #F4F4F6 / #E5E6EA / #6B6E78 — fills, borders, secondary text.
 *
 * Several legacy names (primarySoft, lime, success …) are kept as aliases so
 * every screen resolves to this palette. Do not add new colours.
 */
const INDIGO = '#4F46E5';
const BLACK = '#0E0E10';
const WHITE = '#FFFFFF';
const G100 = '#F4F4F6';
const G200 = '#E5E6EA';
const G500 = '#6B6E78';

export const color = {
  indigo: INDIGO,
  black: BLACK,
  white: WHITE,
  grey100: G100,
  grey200: G200,
  grey500: G500,

  primary: INDIGO,
  primaryPressed: INDIGO,
  primarySoft: G100,
  primaryTint: G200,
  ink: BLACK,
  inkSoft: BLACK,
  text: BLACK,
  textSecondary: G500,
  textTertiary: G500,
  textOnDark: WHITE,
  textOnDarkSecondary: G200,
  lime: INDIGO,
  limePressed: INDIGO,
  limeSoft: G100,
  limeInk: BLACK,
  bg: WHITE,
  surface: WHITE,
  surfaceSunken: G100,
  line: G200,
  lineStrong: G200,
  danger: BLACK,
  dangerSoft: G100,
  warning: BLACK,
  warningSoft: G100,
  success: INDIGO,
  successSoft: G100,
  overlay: 'rgba(14,14,16,0.40)',
} as const;

/** 8-point spacing grid (with 4 for fine adjustments). */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 16, pill: 999 } as const;

/* ------------------------------------------------------------- type -- */

/** Plus Jakarta Sans, loaded in the root layout. One family, five weights. */
export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export function font(weight: TextStyle['fontWeight'] = '400'): TextStyle {
  const w = String(weight);
  const family = w === '800' || w === '900' ? FONT.extrabold : w === '700' || w === 'bold' ? FONT.bold : w === '600' ? FONT.semibold : w === '500' ? FONT.medium : FONT.regular;
  return { fontFamily: family, fontWeight: 'normal' };
}

const t = (fontSize: number, lineHeight: number, weight: TextStyle['fontWeight'], letterSpacing = 0): TextStyle => ({ fontSize, lineHeight, letterSpacing, ...font(weight) });

export const type = {
  display: t(40, 46, '800', -1.2),
  title1: t(30, 36, '800', -0.8),
  title2: t(22, 28, '700', -0.4),
  title3: t(18, 24, '700', -0.2),
  headline: t(16, 22, '600', -0.1),
  body: t(16, 24, '400'),
  callout: t(15, 22, '400'),
  subhead: t(14, 20, '500'),
  footnote: t(13, 18, '400'),
  caption: t(12, 16, '500'),
  overline: { ...t(11, 14, '700', 0.8), textTransform: 'uppercase' as const },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Hayve is flat: borders carry structure. Shadows only for floating layers. */
export const shadow = {
  card: {},
  float: {
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export type ServiceKey = 'home' | 'explore' | 'shop' | 'pay' | 'ride' | 'bites' | 'drive' | 'stay' | 'holidays' | 'all' | 'send' | 'profile';

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

/** Hayve destinations. Send is intentionally not a destination (it lives inside Shop checkout). */
export const SERVICES: ServiceMeta[] = [
  { key: 'home', name: 'Hayve', short: 'Home', route: '/', icon: 'home-outline', iconActive: 'home-outline', accent: BLACK, tagline: 'Everything, connected' },
  { key: 'shop', name: 'Hayve Shop', short: 'Shop', route: '/shop', icon: 'bag-handle-outline', iconActive: 'bag-handle-outline', accent: BLACK, tagline: 'Buy and sell anything' },
  { key: 'pay', name: 'Hayve Pay', short: 'Pay', route: '/pay', icon: 'wallet-outline', iconActive: 'wallet-outline', accent: BLACK, tagline: 'Wallet and payments' },
  { key: 'ride', name: 'Hayve Ride', short: 'Ride', route: '/ride', icon: 'taxi-outline', iconActive: 'taxi-outline', accent: BLACK, tagline: 'Get a ride' },
  { key: 'bites', name: 'Hayve Bites', short: 'Bites', route: '/bites', icon: 'fast-food-outline', iconActive: 'fast-food-outline', accent: BLACK, tagline: 'Food and groceries' },
  { key: 'drive', name: 'Hayve Drive', short: 'Drive', route: '/drive', icon: 'car-outline', iconActive: 'car-outline', accent: BLACK, tagline: 'Rent a car' },
  { key: 'stay', name: 'Hayve Stay', short: 'Stay', route: '/stay', icon: 'bed-outline', iconActive: 'bed-outline', accent: BLACK, tagline: 'Places to stay' },
  { key: 'holidays', name: 'Hayve Holidays', short: 'Holidays', route: '/holidays', icon: 'airplane-outline', iconActive: 'airplane-outline', accent: BLACK, tagline: 'Package trips' },
  { key: 'all', name: 'Everything in Hayve', short: 'All', route: '/services', icon: 'grid', iconActive: 'grid', accent: BLACK, tagline: 'Every service' },
  { key: 'explore', name: 'Search', short: 'Search', route: '/explore', icon: 'search-outline', iconActive: 'search-outline', accent: BLACK, tagline: 'Search everything' },
  { key: 'profile', name: 'Profile', short: 'Profile', route: '/profile', icon: 'person-outline', iconActive: 'person-outline', accent: BLACK, tagline: 'You' },
];

/** The six Hayve products shown in navigation and on Home. */
export const PRODUCTS: ServiceKey[] = ['shop', 'pay', 'ride', 'bites', 'drive', 'stay'];

export const service = (key: ServiceKey) => SERVICES.find((s) => s.key === key) ?? SERVICES[0];

/** Adds alpha to a #RRGGBB colour (for overlays only). */
export function alpha(hex: string, a: number) {
  const n = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${n}`;
}

export const layout = {
  maxContent: 1200,
  sidebar: 248,
  wide: 768,
  desktop: 1100,
};
