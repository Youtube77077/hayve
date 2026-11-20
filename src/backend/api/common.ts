import { DEFAULT_FEE_TIERS, DEFAULT_PAY_REQUESTS, DEFAULT_RIDE, DEFAULT_TAP_TO_PAY, DEFAULT_WAVE_BACK, marketplaceFeeCents, type PayRequestSettings, type RideSettings, SEND_SHIPPING_CENTS, type TapToPaySettings, type WaveBackCategory, type WaveBackSettings } from '../config';
import { accountIdFor, captureHold, createTransaction, type Credit, refundTransaction, SYSTEM, voidHold } from '../ledger';
import { getDb, HayveError, now, uid } from '../store';
import type { ID, NotificationKind, Profile, Settings, Transaction, TxType } from '../types';

export type PayMethod = 'wallet' | 'card' | 'bank' | 'card_declined';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  wallet: 'Hayve Pay balance',
  card: 'Debit or credit card',
  bank: 'Bank account',
  card_declined: 'Card (simulated decline)',
};

/** The user's saved card (default first) and connected bank, used to label card and bank payments. */
export function savedMethodsOf(userId: ID) {
  const all = getDb().paymentMethods.filter((m) => m.userId === userId);
  const card = all.filter((m) => m.kind === 'card').sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0] ?? null;
  const bank = all.filter((m) => m.kind === 'bank').sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0] ?? null;
  return { card, bank };
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

/** Runtime settings (admin-editable), falling back to config.ts defaults. */
type FullSettings = Settings & { waveBack: WaveBackSettings; tapToPay: TapToPaySettings; payRequests: PayRequestSettings; ride: RideSettings };

export function settings(): FullSettings {
  const db = getDb();
  if (!db.settings) db.settings = { feeTiers: DEFAULT_FEE_TIERS, waveBack: DEFAULT_WAVE_BACK, tapToPay: DEFAULT_TAP_TO_PAY };
  // Fill values added in later versions so older saved settings keep working.
  db.settings.waveBack = { ...DEFAULT_WAVE_BACK, ...db.settings.waveBack };
  db.settings.tapToPay = { ...DEFAULT_TAP_TO_PAY, ...db.settings.tapToPay };
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
/** Active admin boost for a merchant (e.g. 5% at a partner for one week). */
export function activeBoost(merchant: string | undefined) {
  if (!merchant) return null;
  const t = now();
  const boosts = (getDb().waveBackBoosts ?? []).filter((b) => b.merchant.toLowerCase() === merchant.toLowerCase() && b.startsAt <= t && t < b.endsAt);
  return boosts.sort((a, b) => b.rate - a.rate)[0] ?? null;
}

export function waveBackRate(category: WaveBackCategory, s: WaveBackSettings) {
  switch (category) {
    case 'shop':
      return s.shopRate;
    case 'services':
      return s.servicesRate;
    case 'tap_hayve':
      return s.tapHayveRate;
    case 'tap_card':
      return s.tapCardRate;
    case 'card_partner':
      return s.cardPartnerRate;
    case 'card_other':
      return s.cardOtherRate;
  }
}

export function computeWaveBack(userId: ID, category: WaveBackCategory, baseCents: number, merchant?: string) {
  const db = getDb();
  const s = settings().waveBack;
  const user = db.users.find((u) => u.id === userId);
  if (!user || baseCents <= 0) return { cents: 0, newUser: false };
  const acc = accountIdFor(userId);
  const mine = db.transactions.filter((t) => t.type === 'wave_back' && t.toAccountId === acc && t.status === 'completed');
  const paidThisMonth = mine.filter((t) => t.createdAt >= monthStart()).reduce((a, t) => a + t.amountCents, 0);
  const paidWelcome = mine.filter((t) => t.meta?.newUser).reduce((a, t) => a + t.amountCents, 0);

  const capShop = (c: number) => (category === 'shop' ? Math.min(c, s.shopMaxPerPurchaseCents) : c);
  const boost = category === 'card_partner' || category === 'card_other' ? activeBoost(merchant) : null;
  const rate = Math.max(waveBackRate(category, s), boost?.rate ?? 0);
  let cents = capShop(Math.round(baseCents * rate));
  let newUser = false;
  const isNew = now() - user.createdAt < s.newUserDays * 86_400_000;
  // The welcome rate applies to purchases on Hayve's own services.
  if ((category === 'shop' || category === 'services') && isNew && paidWelcome < s.newUserMaxTotalCents) {
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
  const { cents, newUser } = computeWaveBack(payerId, tx.waveBack.category, tx.waveBack.baseCents, tx.waveBack.merchant);
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
 * Credits Wave Back to `userId` for a payment (Tap to Pay payers, Hayve Card purchases).
 * Linked to the payment so a refund reverses it. Returns the amount credited.
 */
export function creditWaveBack(userId: ID, category: WaveBackCategory, baseCents: number, opts: { paymentTxId: ID; note?: string; merchant?: string }) {
  const { cents, newUser } = computeWaveBack(userId, category, baseCents, opts.merchant);
  if (cents <= 0) return 0;
  const wb = createTransaction({
    type: 'wave_back',
    fromAccountId: SYSTEM.waveBack,
    credits: [{ accountId: accountIdFor(userId), amountCents: cents }],
    labelForFrom: 'Wave Back',
    labelForTo: 'Wave Back',
    note: opts.note,
    ref: { kind: 'payment', id: opts.paymentTxId },
    method: 'system',
  });
  wb.meta = { newUser };
  return cents;
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
  let fundingTxId: ID | undefined;
  if (input.method === 'card' || input.method === 'bank') {
    // Card and bank payments pass through the wallet so every receipt lives in one history.
    const saved = savedMethodsOf(input.payerId);
    if (input.method === 'bank' && !saved.bank) throw new HayveError('invalid', 'Connect a bank first (Pay → Cards and banks).');
    const total = input.credits.reduce((s, c) => s + c.amountCents, 0);
    const funding = createTransaction({
      type: 'deposit',
      fromAccountId: input.method === 'card' ? SYSTEM.card : SYSTEM.bank,
      credits: [{ accountId: wallet, amountCents: total }],
      labelForFrom: input.method === 'card' ? 'Card' : 'Bank',
      labelForTo: input.method === 'card' ? `${saved.card ? `${saved.card.brand ?? 'Card'} •••• ${saved.card.last4}` : 'Card'} (simulated)` : `${saved.bank!.label} (simulated)`,
      note: input.note,
      method: input.method,
    });
    fundingTxId = funding.id;
  }
  const tx = createTransaction({
    type: input.type,
    fromAccountId: wallet,
    credits: input.credits,
    labelForFrom: input.labelForPayer,
    labelForTo: input.labelForPayee,
    note: input.note,
    ref: input.ref,
    method: input.method === 'wallet' ? 'wallet' : input.method === 'bank' ? 'bank' : 'card',
    mode: 'hold',
  });
  tx.fundingTxId = fundingTxId;
  if (input.waveBack && input.method === 'wallet') tx.waveBack = input.waveBack;
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
