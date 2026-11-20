import { fmtMoney } from '../regions';
import { accountIdFor, createTransaction, refundTransaction, releaseTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { ID, TapPayerMethod, TapPayment } from '../types';
import { cardTopUpIfNeeded, cardForUser } from './card';
import { audit, creditWaveBack, displayName, monthStart, notify, settings, verifiedBusinessOf } from './common';
import { getSessionUserId, me } from './session';

/**
 * Tap to Pay: the receiver's phone becomes a contactless terminal (simulated).
 *
 * Production: Stripe Terminal "Tap to Pay on iPhone/Android" (Adyen as alternative). The app asks
 * the API for a connection token and a PaymentIntent (card_present, with the receiver fee as the
 * application fee); the Terminal SDK collects the tap; the provider confirms through a webhook and
 * only then is the payment marked paid. Hayve never sees or stores card data.
 */

const DAY = 86_400_000;
const METHOD_LABEL: Record<TapPayerMethod, string> = { card: 'Card', apple_pay: 'Apple Pay', google_pay: 'Google Pay', hayve_card: 'Hayve Card', hayve_balance: 'Hayve balance' };

export function receiverFeeCents(amountCents: number) {
  return Math.round(amountCents * settings().tapToPay.receiverFeeRate);
}

function monthReceived(userId: ID) {
  const start = monthStart();
  return getDb()
    .tapPayments.filter((t) => t.receiverId === userId && (t.status === 'pending' || t.status === 'available') && (t.paidAt ?? 0) >= start)
    .reduce((a, t) => a + t.amountCents, 0);
}

/** Moves settled payments from Pending to Available (called whenever tap data is read). */
export function settleDue() {
  const db = getDb();
  let changed = false;
  for (const t of db.tapPayments) {
    if (t.status === 'pending' && t.settleAt && t.settleAt <= now() && t.txId) {
      releaseTransaction(t.txId);
      t.status = 'available';
      changed = true;
    }
  }
  if (changed) commit();
}

export interface TapStatus {
  identityVerified: boolean;
  identityPending: boolean;
  business: boolean;
  monthReceivedCents: number;
  /** null for verified businesses (no private limit). */
  monthlyLimitCents: number | null;
  maxPaymentCents: number;
  feeExampleCents: number;
}

export function status(): TapStatus {
  const user = me();
  const db = getDb();
  const profile = find(db.profiles, (p) => p.userId === user.id, 'Profile');
  const s = settings().tapToPay;
  const business = !!verifiedBusinessOf(user.id);
  return {
    identityVerified: profile.kyc?.status === 'verified',
    identityPending: profile.kyc?.status === 'pending',
    business,
    monthReceivedCents: monthReceived(user.id),
    monthlyLimitCents: business ? null : s.privateMonthlyLimitCents,
    maxPaymentCents: s.maxPaymentCents,
    feeExampleCents: receiverFeeCents(2400),
  };
}

/**
 * Identity check through the payment partner (simulated as instant).
 * Production: Stripe Identity / Connect onboarding; Hayve Store businesses use business verification.
 */
export function verifyIdentity() {
  const user = me();
  const profile = find(getDb().profiles, (p) => p.userId === user.id, 'Profile');
  profile.kyc = { status: 'verified', verifiedAt: now() };
  notify(user.id, 'security', 'Identity verified', 'You can now get paid with Tap to Pay and get a Hayve Card.', '/pay');
  audit(user.id, 'identity.verified', user.id);
  commit();
}

/** Step 1: the receiver enters an amount; the phone then shows "Hold card or phone here". */
export function createCharge(amountCents: number, note = ''): ID {
  const user = me();
  const db = getDb();
  const st = status();
  assert(st.identityVerified, 'forbidden', 'Verify your identity before your first Tap to Pay payment');
  assert(Number.isInteger(amountCents) && amountCents >= 50, 'invalid', `Enter an amount of at least ${fmtMoney(50)}`);
  assert(amountCents <= st.maxPaymentCents, 'invalid', `The most you can take in one tap is ${fmtMoney(st.maxPaymentCents)}`);
  if (st.monthlyLimitCents != null && st.monthReceivedCents + amountCents > st.monthlyLimitCents) {
    throw new HayveError('forbidden', 'This would go over your monthly limit for personal accounts. Switch to a business account (Hayve Store) to receive more.');
  }
  const t: TapPayment = {
    id: uid('tap'),
    receiverId: user.id,
    amountCents,
    feeCents: receiverFeeCents(amountCents),
    note: note.trim().slice(0, 80),
    status: 'awaiting_tap',
    providerRef: `pi_sim_${Math.random().toString(36).slice(2, 12)}`,
    receiptToken: `rcpt_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now(),
  };
  db.tapPayments.push(t);
  commit();
  return t.id;
}

export function cancelCharge(id: ID) {
  const user = me();
  const t = find(getDb().tapPayments, (x) => x.id === id && x.receiverId === user.id, 'Payment');
  if (t.status === 'awaiting_tap') t.status = 'cancelled';
  commit();
}

export interface SimulatedTap {
  method: TapPayerMethod;
  brand?: string;
  last4?: string;
  /** Hayve username of the payer, when the payer uses Hayve. */
  payerUsername?: string;
  /** Simulates losing the connection before the provider confirms. */
  offline?: boolean;
  /** Simulates the card being declined. */
  decline?: boolean;
}

/**
 * Step 2 (simulation of the provider): the payer taps. Only a provider confirmation marks the
 * payment as paid; offline or declined taps leave nothing charged.
 */
export function simulateTap(id: ID, tap: SimulatedTap) {
  const user = me();
  const db = getDb();
  const t = find(db.tapPayments, (x) => x.id === id && x.receiverId === user.id, 'Payment');
  assert(t.status === 'awaiting_tap', 'conflict', 'This payment is no longer waiting for a tap');
  if (tap.offline) throw new HayveError('payment_failed', 'No connection. The payment was not taken. Check your internet and try again.');
  if (tap.decline) {
    t.status = 'failed';
    t.failureReason = 'Card declined';
    commit();
    throw new HayveError('payment_failed', 'The card was declined. Nothing was charged.');
  }

  const payer = tap.payerUsername ? db.profiles.find((p) => p.username === tap.payerUsername!.toLowerCase().replace(/^@/, '')) : undefined;
  const payerId = payer?.userId;
  const usesHayve = tap.method === 'hayve_balance' || tap.method === 'hayve_card';
  assert(!usesHayve || payerId, 'invalid', 'Paying with Hayve needs a Hayve account');
  assert(payerId !== user.id, 'invalid', "You can't pay yourself");

  const receiverAcc = accountIdFor(user.id);
  const net = t.amountCents - t.feeCents;
  const s = settings().tapToPay;
  let brand = tap.brand ?? 'Visa';
  let last4 = tap.last4 ?? '4417';

  let fromAccountId: ID = SYSTEM.card;
  if (usesHayve) {
    if (tap.method === 'hayve_card') {
      const card = cardForUser(payerId!);
      assert(card && card.status === 'active', 'payment_failed', 'The Hayve Card is frozen or not set up');
      cardTopUpIfNeeded(payerId!, t.amountCents);
      brand = 'Hayve Card';
      last4 = card.last4;
    } else {
      brand = 'Hayve balance';
      last4 = '';
    }
    fromAccountId = accountIdFor(payerId!);
  }

  const tx = createTransaction({
    type: 'tap_payment',
    fromAccountId,
    credits: [
      { accountId: receiverAcc, amountCents: net, status: 'pending' },
      { accountId: SYSTEM.fees, amountCents: t.feeCents },
    ],
    labelForFrom: displayName(user.id),
    labelForTo: tap.method === 'card' ? `${brand} •••• ${last4}` : last4 ? `${METHOD_LABEL[tap.method]} •••• ${last4}` : METHOD_LABEL[tap.method],
    note: t.note || 'Tap to Pay',
    ref: { kind: 'tap', id: t.id },
    method: usesHayve ? 'wallet' : 'card',
  });
  tx.meta = { card: { brand, last4 }, tapId: t.id };

  t.status = 'pending';
  t.payerMethod = tap.method;
  t.cardBrand = brand;
  t.last4 = last4;
  t.txId = tx.id;
  t.paidAt = now();
  t.settleAt = now() + s.settleSeconds * 1000;

  // Wave Back for the payer, only when both people use Hayve.
  if (payerId && usesHayve) {
    t.payerUserId = payerId;
    t.waveBackCents = creditWaveBack(payerId, 'tap_hayve', t.amountCents, { paymentTxId: tx.id, note: `Tap to Pay · ${displayName(user.id)}` });
  } else if (payerId && db.paymentMethods.some((m) => m.userId === payerId && m.kind === 'card' && m.last4 === last4)) {
    // The card is saved in the payer's Hayve account (provider card fingerprint match).
    t.payerUserId = payerId;
    t.waveBackCents = creditWaveBack(payerId, 'tap_card', t.amountCents, { paymentTxId: tx.id, note: `Tap to Pay · ${displayName(user.id)}` });
  } else {
    // Wallets (Apple Pay / Google Pay) may use another card number: offer the QR claim instead.
    t.waveBackClaimable = true;
  }
  if (t.payerUserId && t.waveBackCents) notify(t.payerUserId, 'payment', 'Wave Back added', `${fmtMoney(t.waveBackCents)} for paying ${displayName(user.id)}`, '/pay');
  notify(user.id, 'payment', 'Payment received', `${fmtMoney(t.amountCents)} by ${tx.labelForTo}`, `/pay/tap/${t.id}`);
  commit();
  return view(t);
}

export interface TapView extends TapPayment {
  netCents: number;
  methodLabel: string;
  canRefund: boolean;
  refundUntil: number;
  claimUntil: number;
  receiptUrl: string;
}

function view(t: TapPayment): TapView {
  const s = settings().tapToPay;
  const refundUntil = (t.paidAt ?? t.createdAt) + s.refundWindowDays * DAY;
  return {
    ...t,
    netCents: t.amountCents - t.feeCents,
    methodLabel: t.payerMethod ? METHOD_LABEL[t.payerMethod] : '',
    canRefund: (t.status === 'pending' || t.status === 'available') && now() < refundUntil,
    refundUntil,
    claimUntil: (t.paidAt ?? t.createdAt) + s.claimWindowHours * 3_600_000,
    receiptUrl: `https://hayve.app/claim/${t.receiptToken}`,
  };
}

export function getTap(id: ID): TapView {
  settleDue();
  const user = me();
  return view(find(getDb().tapPayments, (x) => x.id === id && x.receiverId === user.id, 'Payment'));
}

export function history(): TapView[] {
  settleDue();
  const user = me();
  return getDb()
    .tapPayments.filter((t) => t.receiverId === user.id && t.status !== 'awaiting_tap' && t.status !== 'cancelled')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(view);
}

/** Refund within the window: back to the payer's original card (or balance). Payer Wave Back is reversed. */
export function refund(id: ID) {
  settleDue();
  const user = me();
  const t = find(getDb().tapPayments, (x) => x.id === id && x.receiverId === user.id, 'Payment');
  const v = view(t);
  assert(v.canRefund, 'conflict', t.status === 'refunded' ? 'Already refunded' : 'Refunds are possible within 30 days of the payment');
  refundTransaction(t.txId!, 'Tap to Pay refund');
  t.status = 'refunded';
  t.refundedAt = now();
  audit(user.id, 'tap.refund', t.id);
  if (t.payerUserId) notify(t.payerUserId, 'refund', 'Payment refunded', `${displayName(user.id)} refunded ${fmtMoney(t.amountCents)}`, '/pay');
  commit();
}

/** Digital receipt by Hayve username or email (simulated delivery). */
export function sendReceipt(id: ID, to: { username?: string; email?: string }) {
  const user = me();
  const db = getDb();
  const t = find(db.tapPayments, (x) => x.id === id && x.receiverId === user.id, 'Payment');
  assert(t.status !== 'awaiting_tap', 'conflict', 'Take the payment first');
  if (to.username) {
    const p = db.profiles.find((x) => x.username === to.username!.toLowerCase().replace(/^@/, ''));
    assert(p, 'not_found', 'No Hayve user with that username');
    notify(p.userId, 'payment', `Receipt from ${displayName(user.id)}`, `${fmtMoney(t.amountCents)}${t.note ? ` · ${t.note}` : ''}`, `/claim/${t.receiptToken}`);
  } else {
    assert(to.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.email), 'invalid', 'Enter a valid email address');
  }
  audit(user.id, 'tap.receipt', t.id);
  commit();
}

/** Public receipt (the QR on the receiver's screen). Contains no card or personal data beyond the shop name. */
export function receipt(token: string) {
  settleDue();
  const t = getDb().tapPayments.find((x) => x.receiptToken === token);
  assert(t && t.status !== 'awaiting_tap' && t.status !== 'cancelled', 'not_found', 'Receipt not found');
  const v = view(t);
  const viewer = getSessionUserId();
  return {
    receiver: displayName(t.receiverId),
    amountCents: t.amountCents,
    note: t.note,
    paidAt: t.paidAt ?? t.createdAt,
    method: v.methodLabel + (t.last4 ? ` •••• ${t.last4}` : ''),
    refunded: t.status === 'refunded',
    claimable: !!t.waveBackClaimable && !t.payerUserId && now() < v.claimUntil && t.status !== 'refunded' && viewer !== t.receiverId,
    claimed: !!t.payerUserId,
    claimUntil: v.claimUntil,
    waveBackPreviewCents: Math.round(t.amountCents * settings().waveBack.tapCardRate),
  };
}

/** "Have Hayve? Scan to get your Wave Back": the payer claims within the window. */
export function claimWaveBack(token: string) {
  const user = me();
  const db = getDb();
  const t = db.tapPayments.find((x) => x.receiptToken === token);
  assert(t && t.txId, 'not_found', 'Receipt not found');
  assert(t.receiverId !== user.id, 'invalid', "You can't claim Wave Back on a payment to yourself");
  assert(t.waveBackClaimable && !t.payerUserId, 'conflict', 'This Wave Back has already been claimed');
  assert(t.status !== 'refunded', 'conflict', 'This payment was refunded');
  assert(now() < view(t).claimUntil, 'conflict', 'This receipt is older than 24 hours');
  t.payerUserId = user.id;
  t.waveBackClaimable = false;
  t.waveBackCents = creditWaveBack(user.id, 'tap_card', t.amountCents, { paymentTxId: t.txId, note: `Tap to Pay · ${displayName(t.receiverId)}` });
  audit(user.id, 'tap.claim', t.id);
  commit();
  return t.waveBackCents;
}
