import { REGIONS } from '../regions';
import { DEFAULT_FEE_TIERS, DEFAULT_PAY_REQUESTS, DEFAULT_RIDE, DEFAULT_WAVE_BACK, marketplaceFeeCents, type PayRequestSettings, type RideSettings, SEND_SHIPPING_CENTS, SEND_ZONES, type ShippingZone, type WaveBackCategory, type WaveBackSettings } from '../config';
import { accountIdFor, balancesFor, captureHold, createTransaction, type Credit, refundTransaction, SYSTEM, voidHold } from '../ledger';
import { getDb, HayveError, now, uid } from '../store';
import type { ID, NotificationKind, Profile, Settings, Transaction, TxType } from '../types';

/**
 * How a purchase is paid:
 *  - wallet: the Hayve Pay balance
 *  - wallet_card: the balance first, the rest by card through the payment provider's checkout
 *  - card: fully by card through the payment provider's checkout (Hayve never sees card details)
 *  - card_declined: test option that simulates a declined card
 */
export type PayMethod = 'wallet' | 'wallet_card' | 'card' | 'card_declined';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  wallet: 'Hayve Pay balance',
  wallet_card: 'Balance + card for the rest',
  card: 'Debit or credit card',
  card_declined: 'Card (simulated decline)',
};

/** The person's payout account (for withdrawals), if they added one. */
export function payoutAccountOf(userId: ID) {
  return getDb().paymentMethods.find((m) => m.userId === userId && m.kind === 'bank') ?? null;
}

export interface PublicUser {
  id: ID;
  username: string;
  displayName: string;
  avatar?: string;
  avatarThumb?: string;
  city: string;
  isPublic: boolean;
  /** Verified Hayve Store business. */
  verified: boolean;
  /** Store name for verified businesses. */
  storeName?: string;
}

export function profileOf(userId: ID): Profile {
  const p = getDb().profiles.find((x) => x.userId === userId);
  if (!p) throw new HayveError('not_found', 'Profile not found');
  return p;
}

export function verifiedBusinessOf(userId: ID) {
  return getDb().businesses.find((b) => b.ownerId === userId && b.status === 'verified') ?? null;
}

export function publicUser(userId: ID): PublicUser {
  const p = profileOf(userId);
  const biz = verifiedBusinessOf(userId);
  return {
    id: userId,
    username: p.username,
    displayName: p.displayName,
    avatar: p.avatar,
    avatarThumb: p.avatarThumb ?? p.avatar,
    city: p.city,
    isPublic: p.isPublic,
    verified: !!biz,
    storeName: biz?.tradingName,
  };
}

export function displayName(userId: ID) {
  return getDb().profiles.find((x) => x.userId === userId)?.displayName ?? 'Hayve user';
}

export function notify(userId: ID, kind: NotificationKind, title: string, body: string, link?: string) {
  const db = getDb();
  const prefs = db.profiles.find((p) => p.userId === userId)?.notificationPrefs;
  // Security notifications cannot be muted.
  if (prefs && prefs[kind] === false && kind !== 'security') return;
  db.notifications.push({ id: uid('n'), userId, kind, title, body, link, read: false, createdAt: now() });
}

export function audit(actorId: ID | null, action: string, target: string) {
  getDb().audit.push({ id: uid('au'), actorId, action, target, createdAt: now() });
}

export const SHIPPING_CENTS = SEND_SHIPPING_CENTS;

const EU = new Set(['IE', 'NL', 'DE', 'FR', 'BE', 'ES', 'IT', 'PT']);
const NORTH_AMERICA = new Set(['US', 'CA']);

/** ISO code for a country written as a code or a name ("United States" → "US"). */
export function countryCodeOf(country?: string | null) {
  if (!country) return null;
  const c = country.trim();
  return REGIONS.find((r) => r.code === c.toUpperCase() || r.name.toLowerCase() === c.toLowerCase())?.code ?? (/^[A-Z]{2}$/i.test(c) ? c.toUpperCase() : null);
}

export function shippingZone(from: string | null, to: string | null): ShippingZone {
  if (!from || !to || from === to) return 'domestic';
  if ((EU.has(from) && EU.has(to)) || (NORTH_AMERICA.has(from) && NORTH_AMERICA.has(to))) return 'region';
  return 'international';
}

/** Hayve Send price from a seller to a destination country (international costs more). */
export function shippingFor(sellerId: ID, destCountry?: string | null) {
  const from = getDb().profiles.find((p) => p.userId === sellerId)?.country ?? null;
  const zone = shippingZone(from, countryCodeOf(destCountry));
  return { cents: SEND_ZONES[zone], zone };
}

/** Runtime settings (admin-editable), falling back to config.ts defaults. */
type FullSettings = Settings & { waveBack: WaveBackSettings; payRequests: PayRequestSettings; ride: RideSettings };

export function settings(): FullSettings {
  const db = getDb();
  if (!db.settings) db.settings = { feeTiers: DEFAULT_FEE_TIERS, waveBack: DEFAULT_WAVE_BACK };
  // Fill values added in later versions so older saved settings keep working.
  db.settings.waveBack = { ...DEFAULT_WAVE_BACK, ...db.settings.waveBack };
  db.settings.payRequests = { ...DEFAULT_PAY_REQUESTS, ...db.settings.payRequests };
  db.settings.ride = { ...DEFAULT_RIDE, ...db.settings.ride };
  return db.settings as FullSettings;
}

/** Marketplace buyer fee for an item price (tiered; see config.ts). */
export function marketplaceFee(priceCents: number) {
  return marketplaceFeeCents(priceCents, settings().feeTiers);
}

/* ------------------------------------------------------------ Wave Back -- */

export function monthStart(t = now()) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * How much Wave Back a balance payment earns. Pure calculation, no side effects.
 * Never applies to top-ups, transfers or fees (callers pass the item/service base only).
 */
export function waveBackRate(category: WaveBackCategory, s: WaveBackSettings) {
  return category === 'shop' ? s.shopRate : s.servicesRate;
}

export function computeWaveBack(userId: ID, category: WaveBackCategory, baseCents: number) {
  const db = getDb();
  const s = settings().waveBack;
  const user = db.users.find((u) => u.id === userId);
  if (!user || baseCents <= 0) return { cents: 0, newUser: false };
  const acc = accountIdFor(userId);
  const mine = db.transactions.filter((t) => t.type === 'wave_back' && t.toAccountId === acc && t.status === 'completed');
  const paidThisMonth = mine.filter((t) => t.createdAt >= monthStart()).reduce((a, t) => a + t.amountCents, 0);
  const paidWelcome = mine.filter((t) => t.meta?.newUser).reduce((a, t) => a + t.amountCents, 0);

  const capShop = (c: number) => (category === 'shop' ? Math.min(c, s.shopMaxPerPurchaseCents) : c);
  const rate = waveBackRate(category, s);
  let cents = capShop(Math.round(baseCents * rate));
  let newUser = false;
  const isNew = now() - user.createdAt < s.newUserDays * 86_400_000;
  // The welcome rate applies to purchases on Hayve's own services.
  if (isNew && paidWelcome < s.newUserMaxTotalCents) {
    const welcome = Math.min(capShop(Math.round(baseCents * s.newUserRate)), s.newUserMaxTotalCents - paidWelcome);
    if (welcome > cents) {
      cents = welcome;
      newUser = true;
    }
  }
  cents = Math.max(0, Math.min(cents, s.monthlyMaxCents - paidThisMonth));
  return { cents, newUser };
}

/** Wave Back the signed-in user would earn by paying with their balance (for checkout hints). */
export function previewWaveBack(userId: ID | null, category: WaveBackCategory, baseCents: number) {
  if (!userId) return 0;
  return computeWaveBack(userId, category, baseCents).cents;
}

function grantWaveBack(tx: Transaction) {
  if (!tx.waveBack || tx.method !== 'wallet' || tx.waveBackCents) return;
  const db = getDb();
  const payerId = db.accounts.find((a) => a.id === tx.fromAccountId)?.ownerId;
  if (!payerId) return;
  const { cents, newUser } = computeWaveBack(payerId, tx.waveBack.category, tx.waveBack.baseCents);
  if (cents <= 0) return;
  const wb = createTransaction({
    type: 'wave_back',
    fromAccountId: SYSTEM.waveBack,
    credits: [{ accountId: accountIdFor(payerId), amountCents: cents }],
    labelForFrom: 'Wave Back',
    labelForTo: 'Wave Back',
    note: tx.note,
    ref: { kind: 'payment', id: tx.id },
    method: 'system',
  });
  wb.meta = { newUser };
  tx.waveBackCents = cents;
}

/**
 * Takes a payment. Wallet payments are first placed on hold, so a failure in
 * any later step can void the hold and leave balances untouched.
 */
export function beginPayment(input: {
  payerId: ID;
  method: PayMethod;
  type: TxType;
  credits: Credit[];
  labelForPayer: string;
  labelForPayee: string;
  note?: string;
  ref?: { kind: string; id: ID };
  /** Eligible amount for Wave Back when paid with the Hayve balance. */
  waveBack?: { category: WaveBackCategory; baseCents: number };
}): Transaction {
  if (input.method === 'card_declined') {
    throw new HayveError('payment_failed', 'Your card was declined (simulated). No money was taken.');
  }
  const wallet = accountIdFor(input.payerId);
  const total = input.credits.reduce((s, c) => s + c.amountCents, 0);
  let fundingTxId: ID | undefined;
  let balancePart = input.method === 'card' ? 0 : total;
  if (input.method === 'card' || input.method === 'wallet_card') {
    // Card money passes through the wallet so every receipt lives in one history.
    // With wallet_card, the card only covers what the balance can't.
    const available = balancesFor(wallet).available;
    const cardPart = input.method === 'card' ? total : Math.max(0, total - available);
    balancePart = total - cardPart;
    if (cardPart > 0) {
      const funding = createTransaction({
        type: 'deposit',
        fromAccountId: SYSTEM.card,
        credits: [{ accountId: wallet, amountCents: cardPart }],
        labelForFrom: 'Card',
        labelForTo: input.method === 'card' ? 'Card payment (simulated checkout)' : 'Card for the rest (simulated checkout)',
        note: input.note,
        method: 'card',
      });
      fundingTxId = funding.id;
    }
  }
  const tx = createTransaction({
    type: input.type,
    fromAccountId: wallet,
    credits: input.credits,
    labelForFrom: input.labelForPayer,
    labelForTo: input.labelForPayee,
    note: input.note,
    ref: input.ref,
    method: input.method === 'card' ? 'card' : 'wallet',
    mode: 'hold',
  });
  tx.fundingTxId = fundingTxId;
  // Wave Back is earned on the part paid from the balance.
  if (input.waveBack && balancePart > 0) tx.waveBack = { category: input.waveBack.category, baseCents: Math.round((input.waveBack.baseCents * balancePart) / total) };
  return tx;
}

/** Captures a held payment and credits Wave Back for balance payments. */
export function completePayment(tx: Transaction, creditStatus: 'posted' | 'pending' = 'posted') {
  const captured = captureHold(tx.id, creditStatus);
  grantWaveBack(captured);
  return captured;
}

export function abortPayment(tx: Transaction | null | undefined) {
  if (!tx) return;
  voidHold(tx.id);
  if (tx.fundingTxId) refundTransaction(tx.fundingTxId, 'Card payment reversed');
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function nightsBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function datesInRange(a: string, b: string, inclusiveEnd = false) {
  const out: string[] = [];
  const start = Date.parse(a);
  const end = Date.parse(b);
  for (let t = start; inclusiveEnd ? t <= end : t < end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
