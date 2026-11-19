/**
 * Hayve business rules in ONE place.
 *
 * Fee tiers and Wave Back values are the defaults; admins can override them at
 * runtime from the admin panel (stored in `settings`), without code changes.
 * Percentages live only here — the UI never shows a percentage.
 */

/* ----------------------------------------------------- Marketplace fees -- */

export interface FeeTier {
  /** Inclusive upper bound of the item price in cents, or null for "and above". */
  upToCents: number | null;
  /** Fraction of the item price, e.g. 0.05. Internal only. */
  rate: number;
}

export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { upToCents: 5_000, rate: 0.05 }, // €0 – €50
  { upToCents: 25_000, rate: 0.04 }, // €50.01 – €250
  { upToCents: 100_000, rate: 0.03 }, // €250.01 – €1,000
  { upToCents: null, rate: 0.02 }, // above €1,000
];

/**
 * Buyer fee for a marketplace item. The fee never goes DOWN when the price
 * goes up: if a tier's fee is lower than the maximum fee of the tiers below,
 * that maximum is charged instead (€250 → €10.00, €260 → €10.00, not €7.80).
 */
export function marketplaceFeeCents(priceCents: number, tiers: FeeTier[] = DEFAULT_FEE_TIERS): number {
  const sorted = [...tiers].sort((a, b) => (a.upToCents ?? Infinity) - (b.upToCents ?? Infinity));
  let floor = 0;
  for (const tier of sorted) {
    if (tier.upToCents == null || priceCents <= tier.upToCents) {
      return Math.max(Math.round(priceCents * tier.rate), floor);
    }
    floor = Math.max(floor, Math.round(tier.upToCents * tier.rate));
  }
  return floor;
}

/* ------------------------------------------------------------ Wave Back -- */

export interface WaveBackSettings {
  /** Hayve Shop and Hayve Store purchases paid with balance. */
  shopRate: number;
  shopMaxPerPurchaseCents: number;
  /** Hayve Ride, Bites, Drive and Stay paid with balance. */
  servicesRate: number;
  /** Welcome rate for new members. */
  newUserRate: number;
  newUserDays: number;
  newUserMaxTotalCents: number;
  /** Hard cap per user per calendar month. */
  monthlyMaxCents: number;
}

export const DEFAULT_WAVE_BACK: WaveBackSettings = {
  shopRate: 0.01,
  shopMaxPerPurchaseCents: 500,
  servicesRate: 0.02,
  newUserRate: 0.05,
  newUserDays: 30,
  newUserMaxTotalCents: 1_000,
  monthlyMaxCents: 2_000,
};

export type WaveBackCategory = 'shop' | 'services';

/* -------------------------------------------------------------- Other -- */

/** Hayve Send flat shipping price for marketplace parcels. */
export const SEND_SHIPPING_CENTS = 395;

/** Dutch standard VAT, used on Hayve Store invoices. */
export const VAT_RATE = 0.21;

/** Owner accounts that receive the admin role when they register. */
export const OWNER_ADMIN_EMAILS = ['rojyarzakholi@gmail.com'];

export const BIO_MAX_CHARS = 200;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_SIZES = { full: 400, thumb: 96 };

/** Simulation-only one-time code (email verification, 2FA, password reset). */
export const SIM_CODE = '246810';
