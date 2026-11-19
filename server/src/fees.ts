/** Server copy of the marketplace fee rule (mirrors src/backend/config.ts and SQL marketplace_fee). */
export interface FeeTier {
  upTo: number | null;
  rate: number;
}

export function marketplaceFeeCents(price: number, tiers: FeeTier[]) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  let floor = 0;
  for (const t of tiers) {
    if (t.upTo === null || price <= t.upTo) return Math.max(Math.round(price * t.rate), floor);
    floor = Math.max(floor, Math.round(t.upTo * t.rate));
  }
  return floor;
}

export function validateTiers(tiers: FeeTier[]): string | null {
  if (!tiers.length || tiers[tiers.length - 1].upTo !== null) return 'The last tier must have no upper limit';
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!(t.rate >= 0 && t.rate <= 0.3)) return 'Rates must be between 0 and 30%';
    if (i > 0 && t.upTo !== null && tiers[i - 1].upTo !== null && t.upTo <= tiers[i - 1].upTo!) return 'Tier limits must increase';
  }
  return null;
}
