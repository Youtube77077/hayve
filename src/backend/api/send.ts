import { fmtMoney } from '../regions';
import { accountIdFor, createTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, reference, uid } from '../store';
import type { CourierProfile, Delivery, DeliveryStatus, ID, ParcelSize } from '../types';
import { abortPayment, beginPayment, completePayment, displayName, notify, type PayMethod } from './common';
import { me, requireRole } from './session';

/** Hayve Send (parcels) and Hayve Courier (couriers). */

export const PARCEL_SIZES: { id: ParcelSize; label: string; dims: string; maxKg: number; baseCents: number }[] = [
  { id: 'S', label: 'Small', dims: 'Fits in a shoebox · 35×25×10 cm', maxKg: 2, baseCents: 495 },
  { id: 'M', label: 'Medium', dims: 'Fits in a backpack · 50×35×25 cm', maxKg: 10, baseCents: 795 },
  { id: 'L', label: 'Large', dims: 'Fits in a car boot · 80×50×40 cm', maxKg: 20, baseCents: 1295 },
  { id: 'XL', label: 'Extra large', dims: 'Furniture & bulky items · van', maxKg: 60, baseCents: 3495 },
];

export const SPEEDS: { id: Delivery['speed']; label: string; eta: string; multiplier: number }[] = [
  { id: 'standard', label: 'Standard', eta: 'Next working day', multiplier: 1 },
  { id: 'express', label: 'Express', eta: 'Today by 22:00', multiplier: 1.5 },
  { id: 'same_day', label: 'Within 90 min', eta: 'Courier dispatched now', multiplier: 2.2 },
];

export function quoteDelivery(size: ParcelSize, weightKg: number, speed: Delivery['speed']) {
  const s = PARCEL_SIZES.find((p) => p.id === size)!;
  const sp = SPEEDS.find((x) => x.id === speed)!;
  const weightSurcharge = Math.max(0, Math.ceil(weightKg - s.maxKg / 2)) * 40;
  return Math.round(((s.baseCents + weightSurcharge) * sp.multiplier) / 5) * 5;
}

export interface DeliveryInput {
  pickup: string;
  dropoff: string;
  recipientName: string;
  recipientPhone: string;
  size: ParcelSize;
  weightKg: number;
  instructions: string;
  speed: Delivery['speed'];
  method: PayMethod;
}

export function bookDelivery(input: DeliveryInput) {
  const user = me();
  const db = getDb();
  assert(input.pickup.trim().length >= 5, 'invalid', 'Enter a collection address');
  assert(input.dropoff.trim().length >= 5, 'invalid', 'Enter a destination address');
  assert(input.pickup.trim().toLowerCase() !== input.dropoff.trim().toLowerCase(), 'invalid', 'Collection and destination must differ');
  assert(input.recipientName.trim().length >= 2, 'invalid', "Enter the recipient's name");
  assert(/^[+\d][\d\s-]{6,}$/.test(input.recipientPhone.trim()), 'invalid', "Enter the recipient's phone number");
  const size = PARCEL_SIZES.find((p) => p.id === input.size);
  assert(size, 'invalid', 'Choose a parcel size');
  assert(input.weightKg > 0 && input.weightKg <= size.maxKg, 'invalid', `${size.label} parcels can weigh up to ${size.maxKg} kg`);
  const price = quoteDelivery(input.size, input.weightKg, input.speed);
  const id = uid('dl');
  const tx = beginPayment({
    payerId: user.id,
    method: input.method,
    type: 'delivery',
    credits: [{ accountId: SYSTEM.fees, amountCents: price }],
    labelForPayer: 'Hayve Send',
    labelForPayee: displayName(user.id),
    note: `${input.size} parcel to ${input.recipientName.trim()}`,
    ref: { kind: 'delivery', id },
  });
  completePayment(tx);
  const d: Delivery = {
    id,
    trackingCode: reference('HX'),
    senderId: user.id,
    courierId: null,
    pickup: input.pickup.trim(),
    dropoff: input.dropoff.trim(),
    recipientName: input.recipientName.trim(),
    recipientPhone: input.recipientPhone.trim(),
    size: input.size,
    weightKg: input.weightKg,
    instructions: input.instructions.trim(),
    speed: input.speed,
    priceCents: price,
    status: 'booked',
    declinedBy: [],
    paymentTxId: tx.id,
    createdAt: now(),
    timeline: [{ status: 'booked', at: now() }],
  };
  db.deliveries.push(d);
  for (const c of db.couriers.filter((x) => x.online && x.userId !== user.id)) notify(c.userId, 'delivery', 'New delivery request', `${size.label} parcel · ${fmtMoney(price * 0.75)} earnings`, '/business/courier');
  commit();
  return id;
}

export interface DeliveryView extends Delivery {
  courierName: string | null;
  role: 'sender' | 'courier';
}

function view(d: Delivery, viewer: ID): DeliveryView {
  return { ...d, courierName: d.courierId ? displayName(d.courierId) : null, role: d.senderId === viewer ? 'sender' : 'courier' };
}

export function myDeliveries() {
  const user = me();
  return getDb()
    .deliveries.filter((d) => d.senderId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((d) => view(d, user.id));
}

export function getDelivery(id: ID) {
  const user = me();
  const d = find(getDb().deliveries, (x) => x.id === id, 'Delivery');
  const courierCanSee = user.roles.includes('courier') && (d.courierId === user.id || d.status === 'booked');
  if (d.senderId !== user.id && !courierCanSee && !user.roles.includes('admin')) throw new HayveError('not_found', 'Delivery not found');
  return view(d, user.id);
}

export function trackByCode(code: string) {
  const d = getDb().deliveries.find((x) => x.trackingCode.toUpperCase() === code.trim().toUpperCase());
  if (!d) throw new HayveError('not_found', 'No parcel with that tracking code');
  // Public tracking exposes status only, never addresses or names.
  return { trackingCode: d.trackingCode, status: d.status, timeline: d.timeline, size: d.size, speed: d.speed };
}

function setStatus(d: Delivery, s: DeliveryStatus) {
  const db = getDb();
  d.status = s;
  d.timeline.push({ status: s, at: now() });
  const msg: Partial<Record<DeliveryStatus, string>> = {
    assigned: 'A courier has accepted your parcel',
    picked_up: 'Your parcel was collected',
    in_transit: 'Your parcel is on its way',
    delivered: `Delivered to ${d.recipientName}`,
  };
  if (msg[s]) notify(d.senderId, 'delivery', `Parcel ${d.trackingCode}`, msg[s]!, `/track/${d.trackingCode}`);
  if (s === 'delivered' && d.courierId) {
    createTransaction({
      type: 'earning',
      fromAccountId: SYSTEM.fees,
      credits: [{ accountId: accountIdFor(d.courierId), amountCents: Math.round(d.priceCents * 0.75) }],
      labelForFrom: displayName(d.courierId),
      labelForTo: 'Hayve Send delivery',
      note: d.trackingCode,
      method: 'system',
      ref: { kind: 'delivery', id: d.id },
    });
    const cp = db.couriers.find((c) => c.userId === d.courierId);
    if (cp) cp.jobs += 1;
  }
}

export function cancelDelivery(id: ID) {
  const user = me();
  const db = getDb();
  const d = find(db.deliveries, (x) => x.id === id && x.senderId === user.id, 'Delivery');
  assert(d.status === 'booked' || d.status === 'assigned', 'conflict', 'Your parcel has already been collected');
  setStatus(d, 'cancelled');
  const tx = db.transactions.find((t) => t.id === d.paymentTxId);
  if (tx?.status === 'reserved') abortPayment(tx);
  else if (tx && tx.status === 'completed') {
    // full refund to the sender
    createTransaction({
      type: 'refund',
      fromAccountId: SYSTEM.fees,
      credits: [{ accountId: accountIdFor(user.id), amountCents: d.priceCents }],
      labelForFrom: displayName(user.id),
      labelForTo: 'Hayve Send refund',
      note: d.trackingCode,
      method: 'system',
      ref: { kind: 'delivery', id: d.id },
    });
  }
  commit();
}

export function simulateDeliveryStep(id: ID) {
  const user = me();
  const db = getDb();
  const d = find(db.deliveries, (x) => x.id === id && x.senderId === user.id, 'Delivery');
  const next: Partial<Record<DeliveryStatus, DeliveryStatus>> = { booked: 'assigned', assigned: 'picked_up', picked_up: 'in_transit', in_transit: 'delivered' };
  const to = next[d.status];
  if (!to) return d.status;
  if (to === 'assigned') d.courierId = (db.couriers.find((c) => c.online && c.userId !== d.senderId) ?? db.couriers[0])?.userId ?? null;
  setStatus(d, to);
  commit();
  return d.status;
}

/* ---------------------------------------------------- Hayve Courier -- */

export function registerCourier(vehicle: CourierProfile['vehicle']) {
  const user = me();
  const db = getDb();
  if (!db.couriers.some((c) => c.userId === user.id)) db.couriers.push({ userId: user.id, vehicle, online: false, rating: 5, jobs: 0 });
  if (!user.roles.includes('courier')) user.roles.push('courier');
  commit();
}

export function courierProfile() {
  const user = requireRole('courier');
  return getDb().couriers.find((c) => c.userId === user.id) ?? null;
}

export function setCourierOnline(online: boolean) {
  const user = requireRole('courier');
  find(getDb().couriers, (c) => c.userId === user.id, 'Courier profile').online = online;
  commit();
}

export function courierQueue() {
  const user = requireRole('courier');
  const db = getDb();
  const c = db.couriers.find((x) => x.userId === user.id);
  if (!c?.online) return [];
  return db.deliveries
    .filter((d) => d.status === 'booked' && d.senderId !== user.id && !d.declinedBy.includes(user.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((d) => view(d, user.id));
}

export function courierJobs() {
  const user = requireRole('courier');
  return getDb()
    .deliveries.filter((d) => d.courierId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((d) => view(d, user.id));
}

export function courierAccept(id: ID) {
  const user = requireRole('courier');
  const d = find(getDb().deliveries, (x) => x.id === id, 'Delivery');
  assert(d.status === 'booked', 'conflict', 'Another courier accepted this job');
  d.courierId = user.id;
  setStatus(d, 'assigned');
  commit();
}

export function courierDecline(id: ID) {
  const user = requireRole('courier');
  const d = find(getDb().deliveries, (x) => x.id === id, 'Delivery');
  if (!d.declinedBy.includes(user.id)) d.declinedBy.push(user.id);
  commit();
}

export function courierAdvance(id: ID) {
  const user = requireRole('courier');
  const d = find(getDb().deliveries, (x) => x.id === id && x.courierId === user.id, 'Delivery');
  const next: Partial<Record<DeliveryStatus, DeliveryStatus>> = { assigned: 'picked_up', picked_up: 'in_transit', in_transit: 'delivered' };
  const to = next[d.status];
  assert(to, 'conflict', 'Nothing to update');
  setStatus(d, to);
  commit();
}
