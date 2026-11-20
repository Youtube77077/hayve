import { type Region, region } from '../regions';
import { fmtMoney } from '../regions';
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
  { role: 'courier', name: 'Hayve Courier', tagline: 'Deliver Hayve Bites orders', route: '/business/courier' },
  { role: 'merchant', name: 'Hayve Store', tagline: 'Verified business account', route: '/business/merchant' },
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

export interface BusinessInput {
  legalName: string;
  tradingName: string;
  category: string;
  registrationNumber: string;
  vatNumber: string;
  address: { line1: string; city: string; postcode: string; country: string };
  /** Country of registration (ISO code). Defaults to the owner's country. */
  countryCode?: string;
  website?: string;
  description?: string;
  /** The owner completed the identity check (simulated document + selfie scan). */
  ownerIdChecked: boolean;
}

function validateBusiness(input: BusinessInput, reg: Region) {
  assert(input.legalName.trim().length >= 2, 'invalid', 'Enter the legal company name');
  assert(input.tradingName.trim().length >= 2, 'invalid', 'Enter your store name');
  assert(reg.businessId.pattern.test(input.registrationNumber.trim()), 'invalid', `Enter your ${reg.businessId.label} (${reg.businessId.hint.toLowerCase()})`);
  const tax = input.vatNumber.replace(/[\s.]/g, '');
  assert(reg.taxId.optional ? !tax || /^[A-Z0-9-]{5,16}$/i.test(tax) : /^[A-Z0-9-]{5,16}$/i.test(tax), 'invalid', `Enter a valid ${reg.taxId.label.replace(' (optional)', '')}`);
  assert(input.address.line1.trim().length >= 4 && input.address.city.trim().length >= 2 && input.address.postcode.trim().length >= 4, 'invalid', 'Enter the full business address');
  assert(input.ownerIdChecked, 'invalid', "Verify the owner's ID before submitting");
}

/** Applies for a Hayve Store business account. A Hayve admin reviews it. */
export function registerBusiness(input: BusinessInput) {
  const reg = region(input.countryCode ?? getDb().profiles.find((p) => p.userId === me().id)?.country);
  const user = me();
  const db = getDb();
  validateBusiness(input, reg);
  const existing = db.businesses.find((b) => b.ownerId === user.id);
  assert(!existing || existing.status === 'rejected', 'conflict', existing?.status === 'verified' ? 'Your business is already verified' : 'Your application is already under review');
  const fields = {
    legalName: input.legalName.trim(),
    tradingName: input.tradingName.trim(),
    category: input.category.trim() || 'Retail',
    registrationNumber: input.registrationNumber.trim(),
    vatNumber: input.vatNumber.replace(/[\s.]/g, '').toUpperCase(),
    country: reg.code,
    address: { line1: input.address.line1.trim(), city: input.address.city.trim(), postcode: input.address.postcode.trim().toUpperCase(), country: input.address.country.trim() || reg.name },
    website: input.website?.trim() ?? '',
    description: input.description?.trim() ?? '',
    ownerIdChecked: true,
    status: 'pending' as const,
    rejectionReason: undefined,
    submittedAt: now(),
  };
  let id: ID;
  if (existing) {
    Object.assign(existing, fields);
    id = existing.id;
  } else {
    const b: Business = { id: uid('biz'), ownerId: user.id, payoutSchedule: 'weekly', createdAt: now(), ...fields };
    db.businesses.push(b);
    id = b.id;
  }
  audit(user.id, 'store.apply', id);
  notify(user.id, 'business', 'Application received', `${fields.tradingName} is being reviewed. This usually takes one business day.`, '/business/merchant');
  commit();
  return id;
}

export function myBusiness() {
  const user = me();
  return getDb().businesses.find((b) => b.ownerId === user.id) ?? null;
}

export function updateStoreProfile(patch: { description?: string; logo?: string; banner?: string; website?: string }) {
  const user = me();
  const b = find(getDb().businesses, (x) => x.ownerId === user.id, 'Business');
  if (patch.description != null) assert(patch.description.length <= 400, 'invalid', 'Description can be up to 400 characters');
  Object.assign(b, patch);
  commit();
}

/** Public store page data for a verified business. */
export function storeFor(userId: ID) {
  const b = getDb().businesses.find((x) => x.ownerId === userId && x.status === 'verified');
  if (!b) return null;
  return { name: b.tradingName, legalName: b.legalName, description: b.description, logo: b.logo, banner: b.banner, website: b.website, city: b.address.city, kvk: b.registrationNumber, idLabel: region(b.country ?? 'NL').businessId.label, since: b.reviewedAt ?? b.createdAt };
}

export function setPayoutSchedule(schedule: Business['payoutSchedule']) {
  const user = me();
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
  assert(b.status === 'verified', 'forbidden', 'Payment links are available once your business is verified');
  assert(title.trim().length >= 2, 'invalid', 'Give the link a name');
  assert(Number.isInteger(amountCents) && amountCents >= 100, 'invalid', `Minimum amount is ${fmtMoney(100)}`);
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
  return { id: link.id, title: link.title, amountCents: link.amountCents, active: link.active, merchant: b.tradingName, verified: b.status === 'verified', isOwner: getSessionUserId() === b.ownerId };
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
    notify(b.ownerId, 'business', 'Payment received', `${fmtMoney(link.amountCents)} · ${link.title}`, '/business/merchant');
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
  if (payer) notify(payer, 'refund', 'Refund received', `${displayName(user.id)} refunded ${fmtMoney(tx.amountCents)}.`, `/pay/tx/${tx.id}`);
  commit();
}
