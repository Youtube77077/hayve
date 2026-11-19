import { accountIdFor, captureHold, createTransaction, type Credit, refundTransaction, SYSTEM, voidHold } from '../ledger';
import { getDb, HayveError, now, uid } from '../store';
import type { ID, NotificationKind, Profile, Transaction, TxType } from '../types';

export type PayMethod = 'wallet' | 'card' | 'card_declined';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  wallet: 'Hayve Pay balance',
  card: 'Card (simulated)',
  card_declined: 'Card (simulated decline)',
};

export interface PublicUser {
  id: ID;
  username: string;
  displayName: string;
  avatar?: string;
  city: string;
  isPublic: boolean;
}

export function profileOf(userId: ID): Profile {
  const p = getDb().profiles.find((x) => x.userId === userId);
  if (!p) throw new HayveError('not_found', 'Profile not found');
  return p;
}

export function publicUser(userId: ID): PublicUser {
  const p = profileOf(userId);
  return { id: userId, username: p.username, displayName: p.displayName, avatar: p.avatar, city: p.city, isPublic: p.isPublic };
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

export const SHIPPING_CENTS = 395;
/** Buyer protection: 5% + €0.70, like leading resale marketplaces. */
export function protectionFee(priceCents: number) {
  return Math.round(priceCents * 0.05) + 70;
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
}): Transaction {
  if (input.method === 'card_declined') {
    throw new HayveError('payment_failed', 'Your card was declined (simulated). No money was taken.');
  }
  const wallet = accountIdFor(input.payerId);
  let fundingTxId: ID | undefined;
  if (input.method === 'card') {
    // Card payments pass through the wallet so every receipt lives in one history.
    const total = input.credits.reduce((s, c) => s + c.amountCents, 0);
    const funding = createTransaction({
      type: 'deposit',
      fromAccountId: SYSTEM.card,
      credits: [{ accountId: wallet, amountCents: total }],
      labelForFrom: 'Card',
      labelForTo: 'Card payment •••• 4242 (simulated)',
      note: input.note,
      method: 'card',
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
    method: input.method === 'wallet' ? 'wallet' : 'card',
    mode: 'hold',
  });
  tx.fundingTxId = fundingTxId;
  return tx;
}

export function completePayment(tx: Transaction, creditStatus: 'posted' | 'pending' = 'posted') {
  return captureHold(tx.id, creditStatus);
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
