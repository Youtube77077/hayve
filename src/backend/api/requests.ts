import { fmtMoney, region } from '../regions';
import { accountIdFor, balancesFor, captureHold, createTransaction, refundTransaction, SYSTEM, voidHold } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { ID, PayRequest, PayRequestKind, PayRequestMethod, PayRequestPayment, PayRequestRef } from '../types';
import { audit, displayName, notify, profileOf, settings, verifiedBusinessOf } from './common';
import { getSessionUserId, me } from './session';

/**
 * Payment requests and links ("Request money"). A request gets an unguessable link that can be
 * shared anywhere (WhatsApp, Snapchat, SMS…). Whoever opens it can pay by bank (iDEAL | Wero),
 * debit or credit card, or with Hayve Pay. They don't need a Hayve account.
 *
 * Personal requests, splits and deposits are free. Business requests pay a small fee per
 * payment (config.ts → payRequests), shown to the business only. The payer never pays a fee.
 */

const DAY = 86_400_000;
const MAX_CENTS = 1_000_000;

export type PayRequestStatus = 'pending' | 'paid' | 'expired' | 'cancelled';

export const EXPIRY_CHOICES = [1, 7, 14, 30] as const;


function statusOf(r: PayRequest): PayRequestStatus {
  if (r.cancelledAt) return 'cancelled';
  if (!r.reusable && fullyPaid(r)) return 'paid';
  if (now() > r.expiresAt) return 'expired';
  return 'pending';
}

function fullyPaid(r: PayRequest) {
  if (r.split) return r.split.shares.every((s) => s.you || s.paidAt);
  return r.payments.some((p) => p.status !== 'refunded' && p.status !== 'released');
}

function businessFee(amountCents: number) {
  const s = settings().payRequests;
  return Math.min(amountCents - 1, Math.round(amountCents * s.businessFeeRate) + s.businessFeeFixedCents);
}

/* ------------------------------------------------------------ linking -- */

export interface Linkable extends PayRequestRef {
  sub: string;
  amountCents?: number;
  /** Stays and rentals can ask for an authorised deposit. */
  depositAllowed: boolean;
}

/** Orders and bookings the signed-in user can attach a request to (as seller, kitchen, host or sender). */
export function linkables(): Linkable[] {
  const user = me();
  const db = getDb();
  const out: (Linkable & { at: number })[] = [];
  // Ordinary purchases only: gift orders are never linkable (the gift buyer must stay private).
  for (const o of db.orders.filter((x) => x.sellerId === user.id && x.kind === 'purchase')) {
    const p = db.products.find((x) => x.id === o.productId);
    out.push({ kind: 'order', id: o.id, label: `Order ${o.reference}`, sub: p?.title ?? 'Hayve Shop order', depositAllowed: false, at: o.createdAt });
  }
  const kitchens = new Set(db.restaurants.filter((r) => r.ownerId === user.id).map((r) => r.id));
  for (const f of db.foodOrders.filter((x) => kitchens.has(x.restaurantId))) {
    out.push({ kind: 'food', id: f.id, label: `Bites order ${f.reference}`, sub: db.restaurants.find((r) => r.id === f.restaurantId)?.name ?? 'Hayve Bites', amountCents: f.totalCents, depositAllowed: false, at: f.createdAt });
  }
  for (const b of db.stayBookings.filter((x) => x.hostId === user.id)) {
    const p = db.properties.find((x) => x.id === b.propertyId);
    out.push({ kind: 'stay', id: b.id, label: `Stay ${b.reference}`, sub: `${p?.title ?? 'Hayve Stay'} · ${b.checkIn} → ${b.checkOut}`, depositAllowed: true, at: b.createdAt });
  }
  for (const r of db.rentals.filter((x) => x.hostId === user.id)) {
    const v = db.vehicles.find((x) => x.id === r.vehicleId);
    out.push({ kind: 'rental', id: r.id, label: `Rental ${r.reference}`, sub: `${v ? `${v.make} ${v.model}` : 'Hayve Drive'} · ${r.start} → ${r.end}`, depositAllowed: true, at: r.createdAt });
  }
  for (const d of db.deliveries.filter((x) => x.senderId === user.id)) {
    out.push({ kind: 'delivery', id: d.id, label: `Delivery ${d.trackingCode}`, sub: `To ${d.recipientName}`, depositAllowed: false, at: d.createdAt });
  }
  return out.sort((a, b) => b.at - a.at).map(({ at: _at, ...l }) => l);
}

/* ------------------------------------------------------------- create -- */

export interface CreateRequestInput {
  kind: PayRequestKind;
  title: string;
  /** Amount per payment. For splits, leave out and give `splitTotalCents` + `people`. */
  amountCents?: number;
  splitTotalCents?: number;
  /** Number of people sharing the bill, including you. */
  people?: number;
  /** Optional names for the other people in a split (in order). */
  names?: string[];
  reusable?: boolean;
  expiresInDays?: number;
  invoiceNumber?: string;
  ref?: { kind: PayRequestRef['kind']; id: ID };
}

export function create(input: CreateRequestInput) {
  const user = me();
  const db = getDb();
  const s = settings().payRequests;
  const title = input.title.trim();
  assert(title.length >= 2 && title.length <= 80, 'invalid', 'Add a short description, like "Dinner"');
  const days = input.expiresInDays ?? s.defaultExpiryDays;
  assert(Number.isInteger(days) && days >= 1 && days <= s.maxExpiryDays, 'invalid', `Links can stay open for up to ${s.maxExpiryDays} days`);

  let ref: PayRequestRef | undefined;
  if (input.ref) {
    const match = linkables().find((l) => l.kind === input.ref!.kind && l.id === input.ref!.id);
    assert(match, 'forbidden', 'You can only link your own orders and bookings');
    ref = { kind: match.kind, id: match.id, label: `${match.label} · ${match.sub}` };
    if (input.kind === 'deposit') assert(match.depositAllowed, 'invalid', 'Deposits are for Hayve Stay and Hayve Drive bookings');
  }
  assert(input.kind !== 'deposit' || ref, 'invalid', 'Choose the stay or rental the deposit is for');

  let amountCents = input.amountCents ?? 0;
  let split: PayRequest['split'];
  if (input.kind === 'split') {
    const people = input.people ?? 0;
    const total = input.splitTotalCents ?? 0;
    assert(Number.isInteger(people) && people >= 2 && people <= s.maxSplitPeople, 'invalid', `Split between 2 and ${s.maxSplitPeople} people`);
    assert(Number.isInteger(total) && total >= people * 100 && total <= MAX_CENTS, 'invalid', `Each person must pay at least ${fmtMoney(100)}`);
    amountCents = Math.round(total / people);
    const names = (input.names ?? []).map((n) => n.trim().slice(0, 40));
    split = {
      totalCents: total,
      shares: [{ id: 's0', name: displayName(user.id), you: true }, ...Array.from({ length: people - 1 }, (_, i) => ({ id: `s${i + 1}`, name: names[i] || `Person ${i + 2}` }))],
    };
  }
  assert(Number.isInteger(amountCents) && amountCents >= 100, 'invalid', `Minimum amount is ${fmtMoney(100)}`);
  assert(amountCents <= MAX_CENTS, 'invalid', `Maximum amount is ${fmtMoney(1000000)}`);

  let business: PayRequest['business'];
  if (input.kind === 'business') {
    const b = verifiedBusinessOf(user.id);
    assert(b, 'forbidden', 'Business requests are for verified Hayve Store businesses');
    const invoice = (input.invoiceNumber ?? '').trim();
    assert(/^[A-Za-z0-9._\-/ ]{1,30}$/.test(invoice), 'invalid', 'Add the invoice number');
    business = { name: b.tradingName, logo: b.logo, invoiceNumber: invoice, verified: true };
  }

  const req: PayRequest = {
    currency: region(profileOf(user.id).country).currency,
    // Unguessable: the link itself is the permission to pay.
    id: `${uid('rq')}${Math.random().toString(36).slice(2, 8)}`,
    requesterId: user.id,
    kind: input.kind,
    title,
    amountCents,
    // Splits close when everyone paid; deposits are one per booking.
    reusable: input.kind === 'split' || input.kind === 'deposit' ? false : !!input.reusable,
    expiresAt: now() + days * DAY,
    split,
    business,
    ref,
    payments: [],
    createdAt: now(),
  };
  db.payRequests.push(req);
  audit(user.id, 'request.create', req.id);
  commit();
  return req.id;
}

/* -------------------------------------------------------------- views -- */

export interface PayRequestView {
  id: ID;
  kind: PayRequestKind;
  title: string;
  amountCents: number;
  reusable: boolean;
  status: PayRequestStatus;
  expiresAt: number;
  createdAt: number;
  /** Money received (after fees for business requests). */
  collectedCents: number;
  feesCents: number;
  heldCents: number;
  paidCount: number;
  /** How many payments complete it (null for reusable links). */
  expectedCount: number | null;
  split?: PayRequest['split'];
  business?: PayRequest['business'];
  ref?: PayRequestRef;
  payments: PayRequestPayment[];
}

function view(r: PayRequest): PayRequestView {
  const live = r.payments.filter((p) => p.status === 'paid' || p.status === 'captured');
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    amountCents: r.amountCents,
    reusable: r.reusable,
    status: statusOf(r),
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    collectedCents: live.reduce((s, p) => s + p.amountCents - p.feeCents, 0),
    feesCents: live.reduce((s, p) => s + p.feeCents, 0),
    heldCents: r.payments.filter((p) => p.status === 'held').reduce((s, p) => s + p.amountCents, 0),
    paidCount: r.split ? r.split.shares.filter((s) => !s.you && s.paidAt).length : live.length + r.payments.filter((p) => p.status === 'held').length,
    expectedCount: r.split ? r.split.shares.length - 1 : r.reusable ? null : 1,
    split: r.split,
    business: r.business,
    ref: r.ref,
    payments: [...r.payments].sort((a, b) => b.at - a.at),
  };
}

function own(id: ID) {
  const user = me();
  const r = find(getDb().payRequests, (x) => x.id === id, 'Request');
  if (r.requesterId !== user.id) throw new HayveError('not_found', 'Request not found');
  return r;
}

/** The signed-in user's request links, newest first, with counts per status for tracking. */
export function mine(status: PayRequestStatus | 'all' = 'all') {
  const user = me();
  const all = getDb()
    .payRequests.filter((r) => r.requesterId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(view);
  const counts = { all: all.length, pending: 0, paid: 0, expired: 0, cancelled: 0 } as Record<PayRequestStatus | 'all', number>;
  for (const r of all) counts[r.status] += 1;
  return { items: status === 'all' ? all : all.filter((r) => r.status === status), counts };
}

export function get(id: ID): PayRequestView {
  return view(own(id));
}

/** Public: what anyone with the link sees. Never includes who else paid or how. */
export function publicView(id: ID) {
  const r = find(getDb().payRequests, (x) => x.id === id, 'Payment request');
  const p = profileOf(r.requesterId);
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    amountCents: r.amountCents,
    currency: r.currency ?? 'USD',
    country: profileOf(r.requesterId).country,
    status: statusOf(r),
    expiresAt: r.expiresAt,
    requester: { displayName: p.displayName, firstName: p.displayName.split(' ')[0], avatar: p.avatarThumb ?? p.avatar },
    business: r.business,
    ref: r.ref ? { kind: r.ref.kind, label: r.ref.label } : undefined,
    shares: r.split?.shares.filter((s) => !s.you).map((s) => ({ id: s.id, name: s.name, paid: !!s.paidAt })),
    splitTotalCents: r.split?.totalCents,
    isOwner: getSessionUserId() === r.requesterId,
  };
}

/* ---------------------------------------------------------------- pay -- */

export interface PayInput {
  method: PayRequestMethod;
  /** Shown to the requester. Guests type it; Hayve users default to their name. */
  payerName?: string;
  /** For splits: which person is paying. */
  shareId?: string;
  /** Pay by bank: the payer's bank and country (their local rail: ACH, pay by bank, iDEAL | Wero…). */
  bank?: string;
  country?: string;
  /** Card payments: brand and last four only, returned by the payment partner's secure form. */
  card?: { brand: string; last4: string };
}

export function pay(id: ID, input: PayInput) {
  const db = getDb();
  const r = find(db.payRequests, (x) => x.id === id, 'Payment request');
  const status = statusOf(r);
  assert(status !== 'cancelled', 'conflict', 'This request was cancelled');
  assert(status !== 'expired', 'conflict', 'This payment link has expired');
  assert(status !== 'paid', 'conflict', 'This request has already been paid');
  const payerId = getSessionUserId();
  assert(payerId !== r.requesterId, 'invalid', "You can't pay your own request");
  if (input.method === 'hayve') assert(payerId, 'unauthenticated', 'Sign in to pay with Hayve Pay');

  let share: NonNullable<PayRequest['split']>['shares'][number] | undefined;
  if (r.split) {
    share = r.split.shares.find((s) => s.id === input.shareId && !s.you);
    assert(share, 'invalid', 'Choose who you are');
    assert(!share.paidAt, 'conflict', `${share.name} has already paid`);
  }

  let methodLabel: string;
  if (input.method === 'bank') {
    const reg = region(input.country ?? profileOf(r.requesterId).country);
    assert(input.bank && reg.banks.includes(input.bank), 'invalid', 'Choose your bank');
    methodLabel = `${reg.bankRailName} · ${input.bank}`;
  } else if (input.method === 'card') {
    assert(input.card && /^\d{4}$/.test(input.card.last4), 'invalid', 'Enter your card details');
    methodLabel = `${input.card.brand} •••• ${input.card.last4}`;
  } else methodLabel = 'Hayve Pay';

  const typed = (input.payerName ?? '').trim().slice(0, 60);
  const payerName = share?.name && !typed ? share.name : typed || (payerId ? displayName(payerId) : '');
  assert(payerName.length >= 2, 'invalid', 'Add your name so they know who paid');

  const amountCents = r.amountCents;
  const feeCents = r.kind === 'business' ? businessFee(amountCents) : 0;
  const from = input.method === 'hayve' ? accountIdFor(payerId!) : input.method === 'bank' ? SYSTEM.bank : SYSTEM.card;
  const credits = [{ accountId: accountIdFor(r.requesterId), amountCents: amountCents - feeCents }, ...(feeCents ? [{ accountId: SYSTEM.fees, amountCents: feeCents }] : [])];
  const tx = createTransaction({
    type: 'request_payment',
    fromAccountId: from,
    credits,
    labelForFrom: r.business?.name ?? displayName(r.requesterId),
    labelForTo: payerName,
    note: r.business ? `${r.title} · Invoice ${r.business.invoiceNumber}` : r.title,
    ref: { kind: 'pay_request', id: r.id },
    method: input.method === 'hayve' ? 'wallet' : input.method,
    // Deposits are authorised (held) until the host releases or claims them.
    mode: r.kind === 'deposit' ? 'hold' : 'capture',
  });
  const payment: PayRequestPayment = {
    id: uid('rp'),
    txId: tx.id,
    payerId: payerId ?? null,
    payerName,
    method: input.method,
    methodLabel,
    amountCents,
    feeCents,
    shareId: share?.id,
    status: r.kind === 'deposit' ? 'held' : 'paid',
    at: now(),
  };
  r.payments.push(payment);
  if (share) share.paidAt = now();
  const money = `${fmtMoney(amountCents)}`;
  notify(r.requesterId, 'payment', r.kind === 'deposit' ? 'Deposit authorised' : `${payerName} paid ${money}`, r.kind === 'deposit' ? `${payerName} · ${money} held for ${r.title}` : r.title, `/pay/link/${r.id}`);
  commit();
  return { paymentId: payment.id, txId: tx.id, signedIn: !!payerId };
}

/* ------------------------------------------------------------ manage -- */

export function cancel(id: ID) {
  const r = own(id);
  assert(statusOf(r) === 'pending', 'conflict', 'Only open requests can be cancelled');
  assert(!r.payments.some((p) => p.status === 'held'), 'conflict', 'Release or claim the deposit first');
  r.cancelledAt = now();
  commit();
}

/** Mark a person in a split as paid (for example, they paid you in cash). */
export function markSharePaid(id: ID, shareId: string) {
  const r = own(id);
  const share = r.split?.shares.find((s) => s.id === shareId && !s.you);
  assert(share, 'not_found', 'Person not found');
  assert(!share.paidAt, 'conflict', 'Already paid');
  share.paidAt = now();
  share.manual = true;
  commit();
}

/** Deposits: give the held money back to the guest. */
export function releaseDeposit(id: ID, paymentId: ID) {
  const r = own(id);
  const p = find(r.payments, (x) => x.id === paymentId && x.status === 'held', 'Deposit');
  voidHold(p.txId);
  p.status = 'released';
  if (p.payerId) notify(p.payerId, 'refund', 'Deposit released', `${fmtMoney(p.amountCents)} for ${r.title} was released.`);
  commit();
}

/** Deposits: keep the held money (for example, for damage). */
export function captureDeposit(id: ID, paymentId: ID) {
  const r = own(id);
  const p = find(r.payments, (x) => x.id === paymentId && x.status === 'held', 'Deposit');
  captureHold(p.txId);
  p.status = 'captured';
  if (p.payerId) notify(p.payerId, 'payment', 'Deposit claimed', `${displayName(r.requesterId)} kept the ${fmtMoney(p.amountCents)} deposit for ${r.title}.`);
  commit();
}

/** Refund one payment (full amount back to how it was paid). */
export function refund(id: ID, paymentId: ID) {
  const r = own(id);
  const p = find(r.payments, (x) => x.id === paymentId && x.status === 'paid', 'Payment');
  assert(balancesFor(accountIdFor(r.requesterId)).available >= p.amountCents - p.feeCents, 'insufficient_funds', 'Not enough balance to refund this payment');
  refundTransaction(p.txId, 'Payment request refunded');
  p.status = 'refunded';
  const share = r.split?.shares.find((s) => s.id === p.shareId);
  if (share) share.paidAt = undefined;
  if (p.payerId) notify(p.payerId, 'refund', 'Refund received', `${displayName(r.requesterId)} refunded ${fmtMoney(p.amountCents)} for ${r.title}.`);
  commit();
}
