import { accountIdFor, balancesFor, refundTransaction, SYSTEM, viewTransaction } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { Business, ID, Role, Transaction } from '../types';
import { abortPayment, audit, beginPayment, completePayment, displayName, notify, type PayMethod } from './common';
import { getSessionUserId, me, requireRole } from './session';

/** Partner roles and Hayve Business (merchant payments). */

export type PartnerRole = 'seller' | 'kitchen' | 'host' | 'driver' | 'courier' | 'merchant';

export const PARTNER_APPS: { role: PartnerRole; name: string; tagline: string; route: string }[] = [
  { role: 'seller', name: 'Hayve Seller', tagline: 'Sell on Hayve Shop', route: '/business/seller' },
  { role: 'kitchen', name: 'Hayve Kitchen', tagline: 'Deliver your menu with Hayve Bites', route: '/business/kitchen' },
  { role: 'host', name: 'Hayve Host', tagline: 'Host stays and rent out vehicles', route: '/business/host' },
  { role: 'driver', name: 'Hayve Driver', tagline: 'Drive passengers with Hayve Ride', route: '/business/driver' },
  { role: 'courier', name: 'Hayve Courier', tagline: 'Deliver food and parcels', route: '/business/courier' },
  { role: 'merchant', name: 'Hayve Business', tagline: 'Accept Hayve Pay anywhere', route: '/business/merchant' },
];

export function myRoles(): Role[] {
  return me().roles;
}

export function becomeSeller() {
  const user = me();
  if (!user.roles.includes('seller')) user.roles.push('seller');
  commit();
}

const ROLE_TYPES: Record<PartnerRole, (t: Transaction) => boolean> = {
  seller: (t) => t.type === 'purchase' || t.type === 'gift_purchase',
  kitchen: (t) => t.type === 'food_order',
  host: (t) => t.type === 'rental' || t.type === 'stay',
  driver: (t) => t.type === 'earning' && t.ref?.kind === 'ride',
  courier: (t) => t.type === 'earning' && (t.ref?.kind === 'food' || t.ref?.kind === 'delivery'),
  merchant: (t) => t.type === 'merchant_payment',
};

export function earnings(role: PartnerRole) {
  const user = me();
  const acc = accountIdFor(user.id);
  const db = getDb();
  const mine = db.transactions.filter(ROLE_TYPES[role]).map((t) => viewTransaction(t, acc)).filter((v) => v && v.direction === 'in') as NonNullable<ReturnType<typeof viewTransaction>>[];
  const settled = mine.filter((v) => v.status === 'completed');
  const pending = mine.filter((v) => v.status === 'pending');
  const series: { label: string; cents: number }[] = [];
  const day0 = new Date();
  day0.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const start = day0.getTime() - i * 86_400_000;
    series.push({
      label: new Date(start).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2),
      cents: mine.filter((v) => v.status !== 'refunded' && v.status !== 'failed' && v.createdAt >= start && v.createdAt < start + 86_400_000).reduce((s, v) => s + v.amountCents, 0),
    });
  }
  return {
    totalCents: settled.reduce((s, v) => s + v.amountCents, 0),
    pendingCents: pending.reduce((s, v) => s + v.amountCents, 0),
    count: mine.filter((v) => v.status !== 'refunded' && v.status !== 'failed').length,
    wallet: balancesFor(acc),
    series,
    recent: mine.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
  };
}

/* ---------------------------------------------------- Hayve Business -- */

export function registerBusiness(input: { legalName: string; tradingName: string; category: string; country: string; registrationNumber: string; vatNumber?: string; website?: string }) {
  const user = me();
  const db = getDb();
  assert(input.legalName.trim().length >= 2, 'invalid', 'Enter the legal business name');
  assert(input.tradingName.trim().length >= 2, 'invalid', 'Enter a trading name');
  assert(input.registrationNumber.trim().length >= 6, 'invalid', 'Enter the chamber of commerce (KvK) number');
  assert(!db.businesses.some((b) => b.ownerId === user.id), 'conflict', 'You already have a business');
  const b: Business = {
    id: uid('biz'),
    ownerId: user.id,
    legalName: input.legalName.trim(),
    tradingName: input.tradingName.trim(),
    category: input.category.trim() || 'Retail',
    country: input.country.trim() || 'Netherlands',
    registrationNumber: input.registrationNumber.trim(),
    vatNumber: input.vatNumber?.trim() ?? '',
    website: input.website?.trim() ?? '',
    verification: { details: true, identity: false, bank: false, status: 'not_started' },
    payoutSchedule: 'weekly',
    createdAt: now(),
  };
  db.businesses.push(b);
  if (!user.roles.includes('merchant')) user.roles.push('merchant');
  audit(user.id, 'business.register', b.id);
  notify(user.id, 'business', 'Business created', `${b.tradingName} is set up. Complete verification to receive payouts.`, '/business/merchant');
  commit();
  return b.id;
}

export function myBusiness() {
  const user = me();
  return getDb().businesses.find((b) => b.ownerId === user.id) ?? null;
}

export function completeVerificationStep(step: 'identity' | 'bank') {
  const user = requireRole('merchant');
  const b = find(getDb().businesses, (x) => x.ownerId === user.id, 'Business');
  b.verification[step] = true;
  b.verification.status = b.verification.identity && b.verification.bank ? 'in_review' : 'not_started';
  if (b.verification.status === 'in_review') {
    // Simulation: reviews are approved instantly.
    b.verification.status = 'verified';
    notify(user.id, 'business', 'Business verified ✅', `${b.tradingName} can now accept Hayve Pay and receive payouts (simulated).`, '/business/merchant');
  }
  commit();
}

export function setPayoutSchedule(schedule: Business['payoutSchedule']) {
  const user = requireRole('merchant');
  find(getDb().businesses, (x) => x.ownerId === user.id, 'Business').payoutSchedule = schedule;
  commit();
}

export function paymentLinks() {
  const user = requireRole('merchant');
  const db = getDb();
  const b = db.businesses.find((x) => x.ownerId === user.id);
  return b ? db.paymentLinks.filter((l) => l.businessId === b.id).sort((a, c) => c.createdAt - a.createdAt) : [];
}

export function createPaymentLink(title: string, amountCents: number) {
  const user = requireRole('merchant');
  const db = getDb();
  const b = find(db.businesses, (x) => x.ownerId === user.id, 'Business');
  assert(title.trim().length >= 2, 'invalid', 'Give the link a name');
  assert(Number.isInteger(amountCents) && amountCents >= 100, 'invalid', 'Minimum amount is €1.00');
  const link = { id: uid('pl'), businessId: b.id, title: title.trim(), amountCents, active: true, payments: 0, createdAt: now() };
  db.paymentLinks.push(link);
  commit();
  return link.id;
}

export function setPaymentLinkActive(id: ID, active: boolean) {
  const user = requireRole('merchant');
  const db = getDb();
  const link = find(db.paymentLinks, (l) => l.id === id, 'Payment link');
  const b = find(db.businesses, (x) => x.id === link.businessId, 'Business');
  if (b.ownerId !== user.id) throw new HayveError('forbidden', 'Not your link');
  link.active = active;
  commit();
}

/** Public: what a customer sees when opening a payment link or scanning a QR code. */
export function getCheckout(linkId: ID) {
  const db = getDb();
  const link = find(db.paymentLinks, (l) => l.id === linkId, 'Payment link');
  const b = find(db.businesses, (x) => x.id === link.businessId, 'Business');
  return { id: link.id, title: link.title, amountCents: link.amountCents, active: link.active, merchant: b.tradingName, verified: b.verification.status === 'verified', isOwner: getSessionUserId() === b.ownerId };
}

/** Customer pays a merchant with Hayve Pay (simulated). */
export function payCheckout(linkId: ID, method: PayMethod) {
  const user = me();
  const db = getDb();
  const link = find(db.paymentLinks, (l) => l.id === linkId, 'Payment link');
  assert(link.active, 'conflict', 'This payment link is no longer active');
  const b = find(db.businesses, (x) => x.id === link.businessId, 'Business');
  assert(b.ownerId !== user.id, 'invalid', "You can't pay your own business");
  const fee = Math.round(link.amountCents * 0.014) + 25; // merchant fee 1.4% + €0.25
  let tx: ReturnType<typeof beginPayment> | null = null;
  try {
    tx = beginPayment({
      payerId: user.id,
      method,
      type: 'merchant_payment',
      credits: [
        { accountId: accountIdFor(b.ownerId), amountCents: link.amountCents - fee },
        { accountId: SYSTEM.fees, amountCents: fee },
      ],
      labelForPayer: b.tradingName,
      labelForPayee: displayName(user.id),
      note: link.title,
      ref: { kind: 'payment_link', id: link.id },
    });
    completePayment(tx);
    link.payments += 1;
    notify(b.ownerId, 'business', 'Payment received', `€${(link.amountCents / 100).toFixed(2)} · ${link.title}`, '/business/merchant');
    commit();
    return tx.id;
  } catch (e) {
    abortPayment(tx);
    commit();
    throw e;
  }
}

export function merchantPayments() {
  const user = requireRole('merchant');
  const acc = accountIdFor(user.id);
  return getDb()
    .transactions.filter((t) => t.type === 'merchant_payment' && t.toAccountId === acc)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => viewTransaction(t, acc)!)
    .filter(Boolean);
}

export function refundMerchantPayment(txId: ID) {
  const user = requireRole('merchant');
  const db = getDb();
  const tx = find(db.transactions, (t) => t.id === txId && t.type === 'merchant_payment', 'Payment');
  if (tx.toAccountId !== accountIdFor(user.id)) throw new HayveError('forbidden', 'Not your payment');
  const { available } = balancesFor(accountIdFor(user.id));
  const credited = db.entries.filter((e) => e.txId === txId && e.accountId === tx.toAccountId && e.status === 'posted').reduce((s, e) => s + e.amountCents, 0);
  assert(available >= credited, 'insufficient_funds', 'Not enough balance to refund this payment');
  refundTransaction(txId, 'Refunded by merchant');
  const payer = db.accounts.find((a) => a.id === tx.fromAccountId)?.ownerId;
  if (payer) notify(payer, 'refund', 'Refund received', `${displayName(user.id)} refunded €${(tx.amountCents / 100).toFixed(2)}.`, `/pay/tx/${tx.id}`);
  commit();
}
