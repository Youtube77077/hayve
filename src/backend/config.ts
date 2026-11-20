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
  /** Hard cap per user per calendar month (all sources combined). */
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

/** shop: Hayve Shop purchases; services: Ride, Bites, Drive and Stay. Paid with the Hayve balance. */
export type WaveBackCategory = 'shop' | 'services';

/* ----------------------------------------------------- Payment requests -- */

/**
 * Payment requests and links (Hayve Pay "Request money"). Personal requests, splits and
 * personal QR codes are free. Business requests pay a small fee per payment, shown to the
 * business as "Fees €X.XX"; the person paying never pays a fee.
 */
export interface PayRequestSettings {
  businessFeeRate: number;
  businessFeeFixedCents: number;
  defaultExpiryDays: number;
  maxExpiryDays: number;
  maxSplitPeople: number;
}

export const DEFAULT_PAY_REQUESTS: PayRequestSettings = {
  businessFeeRate: 0.012,
  businessFeeFixedCents: 20,
  defaultExpiryDays: 14,
  maxExpiryDays: 90,
  maxSplitPeople: 20,
};

/* ---------------------------------------------------------------- Ride -- */

/** Hayve Ride: drivers keep the fare minus Hayve's commission (paid after each trip). */
export interface RideSettings {
  commissionRate: number;
  /** Seconds a driver has to answer an offer before it goes to the next driver. */
  offerSeconds: number;
}

export const DEFAULT_RIDE: RideSettings = { commissionRate: 0.15, offerSeconds: 15 };

/* -------------------------------------------------------------- Other -- */

/** Hayve Send flat shipping price for marketplace parcels sent within one country (base USD cents). */
export const SEND_SHIPPING_CENTS = 395;

/**
 * Hayve Send prices by distance (base USD cents): same country, within one customs area
 * (EU single market, or US–Canada), and international. Shown converted to the buyer's currency.
 */
export const SEND_ZONES = { domestic: 395, region: 895, international: 1895 } as const;
export type ShippingZone = keyof typeof SEND_ZONES;

/** Owner accounts that receive the admin role when they register. */
export const OWNER_ADMIN_EMAILS = ['rojyarzakholi@gmail.com'];

export const BIO_MAX_CHARS = 200;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_SIZES = { full: 400, thumb: 96 };

/** Simulation-only one-time code (email verification, 2FA, password reset). */
export const SIM_CODE = '246810';
