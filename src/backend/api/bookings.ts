import { accountIdFor, refundTransaction, releaseTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, reference, uid } from '../store';
import type { BookingStatus, ID, Property, PropertyType, Rental, RentalVehicle, StayBooking, VehicleType } from '../types';
import {
  abortPayment,
  audit,
  beginPayment,
  completePayment,
  datesInRange,
  displayName,
  nightsBetween,
  notify,
  type PayMethod,
  publicUser,
} from './common';
import { ratingFor } from './shop';
import { getSessionUserId, me, requireRole } from './session';

/** Hayve Drive (car rentals), Hayve Stay (accommodation) and Hayve Host. */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const HOST_SHARE = 0.85;

function validRange(start: string, end: string, minNights = 1) {
  assert(ISO.test(start) && ISO.test(end), 'invalid', 'Choose your dates');
  assert(start >= today(), 'invalid', 'Dates must be in the future');
  assert(nightsBetween(start, end) >= minNights, 'invalid', 'End date must be after the start date');
  assert(nightsBetween(start, end) <= 90, 'invalid', 'Maximum booking length is 90 days');
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

/* ------------------------------------------------------------- Drive -- */

export const VEHICLE_TYPES: { id: VehicleType; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'sedan', label: 'Sedan & estate' },
  { id: 'suv', label: 'SUV' },
  { id: 'electric', label: 'Electric' },
  { id: 'van', label: 'Van & 9-seater' },
  { id: 'luxury', label: 'Luxury & sports' },
];

export interface VehicleQuery {
  location?: string;
  type?: VehicleType | 'all';
  maxPerDayCents?: number;
  start?: string;
  end?: string;
  transmission?: 'automatic' | 'manual' | 'any';
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'rating';
}

export function vehicleAvailable(v: RentalVehicle, start: string, end: string, ignoreRentalId?: ID) {
  const db = getDb();
  if (datesInRange(start, end, true).some((d) => v.blockedDates.includes(d))) return false;
  return !db.rentals.some(
    (r) => r.vehicleId === v.id && r.id !== ignoreRentalId && ['requested', 'confirmed', 'active'].includes(r.status) && overlaps(start, end, r.start, r.end),
  );
}

export function vehicleBookedDates(vehicleId: ID) {
  const db = getDb();
  const v = find(db.vehicles, (x) => x.id === vehicleId, 'Vehicle');
  const set = new Set(v.blockedDates);
  for (const r of db.rentals) if (r.vehicleId === vehicleId && ['requested', 'confirmed', 'active'].includes(r.status)) datesInRange(r.start, r.end, true).forEach((d) => set.add(d));
  return Array.from(set);
}

export function listVehicles(q: VehicleQuery = {}) {
  const loc = q.location?.trim().toLowerCase();
  let rows = getDb().vehicles.filter((v) => {
    if (!v.listed) return false;
    if (q.type && q.type !== 'all' && v.type !== q.type) return false;
    if (q.maxPerDayCents && v.pricePerDayCents > q.maxPerDayCents) return false;
    if (q.transmission && q.transmission !== 'any' && v.transmission !== q.transmission) return false;
    if (loc && !`${v.location} ${v.make} ${v.model}`.toLowerCase().includes(loc)) return false;
    if (q.start && q.end && q.end > q.start && !vehicleAvailable(v, q.start, q.end)) return false;
    return true;
  });
  if (q.sort === 'price_asc') rows = rows.sort((a, b) => a.pricePerDayCents - b.pricePerDayCents);
  else if (q.sort === 'price_desc') rows = rows.sort((a, b) => b.pricePerDayCents - a.pricePerDayCents);
  else if (q.sort === 'rating') rows = rows.sort((a, b) => b.rating - a.rating);
  else rows = rows.sort((a, b) => b.rating * Math.log(b.trips + 2) - a.rating * Math.log(a.trips + 2));
  return rows;
}

export function getVehicle(id: ID) {
  const db = getDb();
  const v = find(db.vehicles, (x) => x.id === id, 'Vehicle');
  const reviews = db.reviews.filter((r) => r.targetKind === 'vehicle' && r.targetId === id).map((r) => ({ ...r, author: displayName(r.authorId) }));
  return { vehicle: v, host: publicUser(v.hostId), hostRating: ratingFor('user', v.hostId), reviews };
}

export function quoteRental(vehicleId: ID, start: string, end: string) {
  const v = find(getDb().vehicles, (x) => x.id === vehicleId, 'Vehicle');
  const days = Math.max(1, nightsBetween(start, end));
  const base = v.pricePerDayCents * days;
  const discount = days >= 7 ? Math.round(base * 0.15) : days >= 3 ? Math.round(base * 0.05) : 0;
  const insurance = 1200 * days;
  const serviceFee = Math.round((base - discount) * 0.08);
  return { days, baseCents: base, discountCents: discount, insuranceCents: insurance, serviceFeeCents: serviceFee, totalCents: base - discount + insurance + serviceFee, depositCents: v.requirements.depositCents };
}

export function bookRental(input: { vehicleId: ID; start: string; end: string; pickupLocation: string; returnLocation: string; method: PayMethod; driverAge: number }) {
  const user = me();
  const db = getDb();
  const v = find(db.vehicles, (x) => x.id === input.vehicleId && x.listed, 'Vehicle');
  assert(v.hostId !== user.id, 'invalid', "You can't rent your own vehicle");
  validRange(input.start, input.end);
  assert(input.driverAge >= v.requirements.minAge, 'invalid', `The minimum driver age for this vehicle is ${v.requirements.minAge}`);
  assert(vehicleAvailable(v, input.start, input.end), 'conflict', 'This vehicle is not available for those dates');
  const q = quoteRental(v.id, input.start, input.end);
  const id = uid('rn');
  const hostShare = Math.round((q.baseCents - q.discountCents) * HOST_SHARE);
  const tx = beginPayment({
    payerId: user.id,
    method: input.method,
    type: 'rental',
    credits: [
      { accountId: accountIdFor(v.hostId), amountCents: hostShare, status: 'pending' },
      { accountId: SYSTEM.fees, amountCents: q.totalCents - hostShare },
    ],
    labelForPayer: `${v.make} ${v.model}`,
    labelForPayee: `Hayve Drive · ${displayName(user.id)}`,
    note: `${input.start} → ${input.end}`,
    ref: { kind: 'rental', id },
  });
  const rental: Rental = {
    id,
    reference: reference('HD'),
    vehicleId: v.id,
    renterId: user.id,
    hostId: v.hostId,
    pickupLocation: input.pickupLocation.trim() || v.location,
    returnLocation: input.returnLocation.trim() || v.location,
    start: input.start,
    end: input.end,
    days: q.days,
    totalCents: q.totalCents,
    status: 'requested',
    paymentTxId: tx.id,
    createdAt: now(),
  };
  db.rentals.push(rental);
  notify(v.hostId, 'rental', 'New booking request', `${v.make} ${v.model} · ${input.start} → ${input.end}`, '/business/host');
  notify(user.id, 'rental', 'Request sent', `${v.make} ${v.model}. Your payment is reserved until the host confirms.`, `/drive/booking/${id}`);
  commit();
  return id;
}

export interface RentalView extends Rental {
  vehicle: Pick<RentalVehicle, 'id' | 'make' | 'model' | 'year' | 'images' | 'location'>;
  renterName: string;
  hostName: string;
  role: 'renter' | 'host';
}

function rentalView(r: Rental, viewer: ID): RentalView {
  const v = getDb().vehicles.find((x) => x.id === r.vehicleId)!;
  return {
    ...r,
    vehicle: { id: v.id, make: v.make, model: v.model, year: v.year, images: v.images, location: v.location },
    renterName: displayName(r.renterId),
    hostName: displayName(r.hostId),
    role: r.renterId === viewer ? 'renter' : 'host',
  };
}

export function myRentals() {
  const user = me();
  return getDb()
    .rentals.filter((r) => r.renterId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => rentalView(r, user.id));
}

export function getRental(id: ID) {
  const user = me();
  const r = find(getDb().rentals, (x) => x.id === id, 'Booking');
  if (r.renterId !== user.id && r.hostId !== user.id) throw new HayveError('not_found', 'Booking not found');
  return rentalView(r, user.id);
}

function settle(paymentTxId: ID | undefined, to: BookingStatus) {
  const db = getDb();
  const tx = db.transactions.find((t) => t.id === paymentTxId);
  if (!tx) return;
  if (to === 'confirmed' && tx.status === 'reserved') completePayment(tx, 'pending');
  else if ((to === 'declined' || to === 'cancelled') && tx.status === 'reserved') abortPayment(tx);
  else if (to === 'cancelled' && (tx.status === 'pending' || tx.status === 'completed')) refundTransaction(tx.id, 'Booking cancelled');
  else if (to === 'completed' && tx.status === 'pending') releaseTransaction(tx.id);
}

export function cancelRental(id: ID) {
  const user = me();
  const r = find(getDb().rentals, (x) => x.id === id && x.renterId === user.id, 'Booking');
  assert(r.status === 'requested' || r.status === 'confirmed', 'conflict', 'This booking can no longer be cancelled');
  settle(r.paymentTxId, 'cancelled');
  r.status = 'cancelled';
  notify(r.hostId, 'rental', 'Booking cancelled', `${r.reference} was cancelled by the renter.`, '/business/host');
  commit();
}

/* -------------------------------------------------------------- Stay -- */

export const PROPERTY_TYPES: { id: PropertyType; label: string }[] = [
  { id: 'apartment', label: 'Apartments' },
  { id: 'house', label: 'Houses' },
  { id: 'room', label: 'Rooms' },
  { id: 'studio', label: 'Studios' },
  { id: 'holiday_home', label: 'Holiday homes' },
];

export const AMENITIES = ['Wi-Fi', 'Kitchen', 'Washer', 'Free parking', 'Air conditioning', 'Pool', 'Garden', 'Workspace', 'Balcony', 'Elevator', 'Sea view', 'BBQ', 'Heating', 'Terrace'];

export interface PropertyQuery {
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  type?: PropertyType | 'all';
  maxPerNightCents?: number;
  amenities?: string[];
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'rating';
}

export function propertyAvailable(p: Property, checkIn: string, checkOut: string) {
  const db = getDb();
  if (datesInRange(checkIn, checkOut).some((d) => p.blockedDates.includes(d))) return false;
  return !db.stayBookings.some((b) => b.propertyId === p.id && ['requested', 'confirmed', 'active'].includes(b.status) && overlaps(checkIn, checkOut, b.checkIn, b.checkOut));
}

export function bookedDates(propertyId: ID) {
  const db = getDb();
  const p = find(db.properties, (x) => x.id === propertyId, 'Property');
  const set = new Set(p.blockedDates);
  for (const b of db.stayBookings) if (b.propertyId === propertyId && ['requested', 'confirmed', 'active'].includes(b.status)) datesInRange(b.checkIn, b.checkOut).forEach((d) => set.add(d));
  return Array.from(set);
}

export function listProperties(q: PropertyQuery = {}) {
  const dest = q.destination?.trim().toLowerCase();
  let rows = getDb().properties.filter((p) => {
    if (!p.listed) return false;
    if (dest && !`${p.city} ${p.country} ${p.neighbourhood} ${p.title}`.toLowerCase().includes(dest)) return false;
    if (q.guests && p.guests < q.guests) return false;
    if (q.type && q.type !== 'all' && p.type !== q.type) return false;
    if (q.maxPerNightCents && p.pricePerNightCents > q.maxPerNightCents) return false;
    if (q.amenities?.length && !q.amenities.every((a) => p.amenities.includes(a))) return false;
    if (q.checkIn && q.checkOut && q.checkOut > q.checkIn && !propertyAvailable(p, q.checkIn, q.checkOut)) return false;
    return true;
  });
  if (q.sort === 'price_asc') rows = rows.sort((a, b) => a.pricePerNightCents - b.pricePerNightCents);
  else if (q.sort === 'price_desc') rows = rows.sort((a, b) => b.pricePerNightCents - a.pricePerNightCents);
  else if (q.sort === 'rating') rows = rows.sort((a, b) => b.rating - a.rating);
  else rows = rows.sort((a, b) => b.rating * Math.log(b.reviewCount + 2) - a.rating * Math.log(a.reviewCount + 2));
  return rows;
}

export function getProperty(id: ID) {
  const db = getDb();
  const p = find(db.properties, (x) => x.id === id, 'Property');
  const reviews = db.reviews.filter((r) => r.targetKind === 'property' && r.targetId === id).map((r) => ({ ...r, author: displayName(r.authorId), avatar: publicUser(r.authorId).avatar }));
  const hostSince = db.users.find((u) => u.id === p.hostId)?.createdAt ?? now();
  return { property: p, host: publicUser(p.hostId), hostSince, hostListings: db.properties.filter((x) => x.hostId === p.hostId).length, reviews, booked: bookedDates(id) };
}

export function toggleSavedProperty(propertyId: ID) {
  const user = me();
  const db = getDb();
  find(db.properties, (x) => x.id === propertyId, 'Property');
  const i = db.savedProperties.findIndex((s) => s.userId === user.id && s.propertyId === propertyId);
  if (i >= 0) db.savedProperties.splice(i, 1);
  else db.savedProperties.push({ userId: user.id, propertyId, createdAt: now() });
  commit();
  return i < 0;
}

export function savedPropertyIds(): ID[] {
  const id = getSessionUserId();
  if (!id) return [];
  return getDb().savedProperties.filter((s) => s.userId === id).map((s) => s.propertyId);
}

export function quoteStay(propertyId: ID, checkIn: string, checkOut: string) {
  const p = find(getDb().properties, (x) => x.id === propertyId, 'Property');
  const nights = Math.max(1, nightsBetween(checkIn, checkOut));
  const base = p.pricePerNightCents * nights;
  const weekly = nights >= 7 ? Math.round(base * 0.1) : 0;
  const service = Math.round((base - weekly) * 0.12);
  const taxes = Math.round((base - weekly) * 0.07);
  return { nights, baseCents: base, discountCents: weekly, cleaningFeeCents: p.cleaningFeeCents, serviceFeeCents: service, taxesCents: taxes, totalCents: base - weekly + p.cleaningFeeCents + service + taxes };
}

export function bookStay(input: { propertyId: ID; checkIn: string; checkOut: string; guests: number; method: PayMethod; message?: string }) {
  const user = me();
  const db = getDb();
  const p = find(db.properties, (x) => x.id === input.propertyId && x.listed, 'Property');
  assert(p.hostId !== user.id, 'invalid', "You can't book your own property");
  validRange(input.checkIn, input.checkOut);
  assert(input.guests >= 1 && input.guests <= p.guests, 'invalid', `This place fits up to ${p.guests} guests`);
  assert(propertyAvailable(p, input.checkIn, input.checkOut), 'conflict', 'Those dates are no longer available');
  const q = quoteStay(p.id, input.checkIn, input.checkOut);
  const id = uid('sb');
  const hostShare = Math.round((q.baseCents - q.discountCents + q.cleaningFeeCents) * HOST_SHARE);
  const tx = beginPayment({
    payerId: user.id,
    method: input.method,
    type: 'stay',
    credits: [
      { accountId: accountIdFor(p.hostId), amountCents: hostShare, status: 'pending' },
      { accountId: SYSTEM.fees, amountCents: q.totalCents - hostShare },
    ],
    labelForPayer: p.title,
    labelForPayee: `Hayve Stay · ${displayName(user.id)}`,
    note: `${input.checkIn} → ${input.checkOut}`,
    ref: { kind: 'stay', id },
  });
  const booking: StayBooking = {
    id,
    reference: reference('HY'),
    propertyId: p.id,
    guestId: user.id,
    hostId: p.hostId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: q.nights,
    guests: input.guests,
    totalCents: q.totalCents,
    status: p.instantBook ? 'confirmed' : 'requested',
    paymentTxId: tx.id,
    createdAt: now(),
  };
  if (p.instantBook) completePayment(tx, 'pending');
  db.stayBookings.push(booking);

  if (input.message?.trim()) {
    let thread = db.threads.find((t) => t.participantIds.includes(user.id) && t.participantIds.includes(p.hostId) && t.context?.id === p.id);
    if (!thread) {
      thread = { id: uid('th'), participantIds: [user.id, p.hostId], context: { kind: 'property', id: p.id, title: p.title }, lastMessageAt: now() };
      db.threads.push(thread);
    }
    db.messages.push({ id: uid('m'), threadId: thread.id, senderId: user.id, body: input.message.trim(), createdAt: now(), readBy: [user.id] });
    thread.lastMessageAt = now();
  }
  notify(p.hostId, 'stay', p.instantBook ? 'New reservation' : 'New booking request', `${p.title} · ${input.checkIn} → ${input.checkOut} · ${input.guests} guests`, '/business/host');
  notify(user.id, 'stay', p.instantBook ? 'Reservation confirmed' : 'Request sent', p.instantBook ? `${p.title} · ${booking.reference}` : `${p.title}. Your payment is reserved until the host confirms.`, `/stay/booking/${id}`);
  commit();
  return id;
}

export interface StayView extends StayBooking {
  property: Pick<Property, 'id' | 'title' | 'images' | 'city' | 'country' | 'neighbourhood'>;
  guestName: string;
  hostName: string;
  role: 'guest' | 'host';
}

function stayView(b: StayBooking, viewer: ID): StayView {
  const p = getDb().properties.find((x) => x.id === b.propertyId)!;
  return {
    ...b,
    property: { id: p.id, title: p.title, images: p.images, city: p.city, country: p.country, neighbourhood: p.neighbourhood },
    guestName: displayName(b.guestId),
    hostName: displayName(b.hostId),
    role: b.guestId === viewer ? 'guest' : 'host',
  };
}

export function myStays() {
  const user = me();
  return getDb()
    .stayBookings.filter((b) => b.guestId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((b) => stayView(b, user.id));
}

export function getStay(id: ID) {
  const user = me();
  const b = find(getDb().stayBookings, (x) => x.id === id, 'Booking');
  if (b.guestId !== user.id && b.hostId !== user.id) throw new HayveError('not_found', 'Booking not found');
  return stayView(b, user.id);
}

export function cancelStay(id: ID) {
  const user = me();
  const b = find(getDb().stayBookings, (x) => x.id === id && x.guestId === user.id, 'Booking');
  assert(b.status === 'requested' || b.status === 'confirmed', 'conflict', 'This booking can no longer be cancelled');
  settle(b.paymentTxId, 'cancelled');
  b.status = 'cancelled';
  notify(b.hostId, 'stay', 'Reservation cancelled', `${b.reference} was cancelled by the guest.`, '/business/host');
  commit();
}

/* -------------------------------------------------------- Hayve Host -- */

export function becomeHost() {
  const user = me();
  if (!user.roles.includes('host')) user.roles.push('host');
  commit();
}

export function hostListings() {
  const user = requireRole('host');
  const db = getDb();
  return { properties: db.properties.filter((p) => p.hostId === user.id), vehicles: db.vehicles.filter((v) => v.hostId === user.id) };
}

export function hostBookings() {
  const user = requireRole('host');
  const db = getDb();
  return {
    stays: db.stayBookings.filter((b) => b.hostId === user.id).sort((a, b) => b.createdAt - a.createdAt).map((b) => stayView(b, user.id)),
    rentals: db.rentals.filter((r) => r.hostId === user.id).sort((a, b) => b.createdAt - a.createdAt).map((r) => rentalView(r, user.id)),
  };
}

export function hostRespond(kind: 'stay' | 'rental', id: ID, action: 'accept' | 'decline' | 'complete') {
  const user = requireRole('host');
  const db = getDb();
  const b = kind === 'stay' ? db.stayBookings.find((x) => x.id === id) : db.rentals.find((x) => x.id === id);
  if (!b || b.hostId !== user.id) throw new HayveError('not_found', 'Booking not found');
  const guestId = kind === 'stay' ? (b as StayBooking).guestId : (b as Rental).renterId;
  const link = kind === 'stay' ? `/stay/booking/${id}` : `/drive/booking/${id}`;
  if (action === 'accept') {
    assert(b.status === 'requested', 'conflict', 'Already answered');
    settle(b.paymentTxId, 'confirmed');
    b.status = 'confirmed';
    notify(guestId, kind, 'Booking confirmed 🎉', `${b.reference} was accepted by your host.`, link);
  } else if (action === 'decline') {
    assert(b.status === 'requested', 'conflict', 'Already answered');
    settle(b.paymentTxId, 'declined');
    b.status = 'declined';
    notify(guestId, kind, 'Booking declined', `${b.reference} was declined. Your reserved payment was released.`, link);
  } else {
    assert(b.status === 'confirmed' || b.status === 'active', 'conflict', 'Only confirmed bookings can be completed');
    settle(b.paymentTxId, 'completed');
    b.status = 'completed';
    notify(user.id, 'payment', 'Payout released', `Earnings for ${b.reference} are now available.`, '/pay');
  }
  audit(user.id, `host.${action}`, id);
  commit();
}

export interface PropertyInput {
  title: string;
  type: PropertyType;
  city: string;
  country: string;
  neighbourhood: string;
  description: string;
  pricePerNightCents: number;
  cleaningFeeCents: number;
  guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
  images: string[];
  instantBook: boolean;
}

export function upsertProperty(input: PropertyInput & { id?: ID }) {
  const user = requireRole('host');
  const db = getDb();
  assert(input.title.trim().length >= 5, 'invalid', 'Add a descriptive title');
  assert(input.city.trim().length >= 2, 'invalid', 'Enter the city');
  assert(input.description.trim().length >= 20, 'invalid', 'Describe the place (at least 20 characters)');
  assert(input.pricePerNightCents >= 1000, 'invalid', 'Nightly price must be at least €10');
  assert(input.guests >= 1 && input.bedrooms >= 0 && input.beds >= 1 && input.baths >= 0, 'invalid', 'Check the capacity details');
  assert(input.images.length >= 1, 'invalid', 'Add at least one photo');
  if (input.id) {
    const p = find(db.properties, (x) => x.id === input.id && x.hostId === user.id, 'Property');
    Object.assign(p, input);
    commit();
    return p.id;
  }
  const p: Property = { ...input, id: uid('st'), hostId: user.id, rating: 0, reviewCount: 0, listed: true, blockedDates: [], createdAt: now() };
  db.properties.push(p);
  commit();
  return p.id;
}

export function setPropertyListed(id: ID, listed: boolean) {
  const user = requireRole('host');
  find(getDb().properties, (x) => x.id === id && x.hostId === user.id, 'Property').listed = listed;
  commit();
}

export function toggleBlockedDate(kind: 'property' | 'vehicle', id: ID, date: string) {
  const user = requireRole('host');
  const db = getDb();
  const row = kind === 'property' ? db.properties.find((x) => x.id === id && x.hostId === user.id) : db.vehicles.find((x) => x.id === id && x.hostId === user.id);
  if (!row) throw new HayveError('not_found', 'Listing not found');
  row.blockedDates = row.blockedDates.includes(date) ? row.blockedDates.filter((d) => d !== date) : [...row.blockedDates, date];
  commit();
}

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  seats: number;
  transmission: 'automatic' | 'manual';
  fuel: RentalVehicle['fuel'];
  pricePerDayCents: number;
  location: string;
  images: string[];
  features: string[];
  minAge: number;
  depositCents: number;
}

export function upsertVehicle(input: VehicleInput & { id?: ID }) {
  const user = requireRole('host');
  const db = getDb();
  assert(input.make.trim() && input.model.trim(), 'invalid', 'Enter make and model');
  assert(input.year >= 1990 && input.year <= new Date().getFullYear() + 1, 'invalid', 'Enter a valid year');
  assert(input.pricePerDayCents >= 1500, 'invalid', 'Daily price must be at least €15');
  assert(input.location.trim().length >= 2, 'invalid', 'Enter the pickup location');
  assert(input.images.length >= 1, 'invalid', 'Add at least one photo');
  const base = {
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year,
    type: input.type,
    seats: input.seats,
    doors: input.seats > 5 ? 4 : 5,
    transmission: input.transmission,
    fuel: input.fuel,
    pricePerDayCents: input.pricePerDayCents,
    location: input.location.trim(),
    images: input.images,
    features: input.features,
    requirements: { minAge: input.minAge, licenseYears: 2, depositCents: input.depositCents },
  };
  if (input.id) {
    const v = find(db.vehicles, (x) => x.id === input.id && x.hostId === user.id, 'Vehicle');
    Object.assign(v, base);
    commit();
    return v.id;
  }
  const v: RentalVehicle = { ...base, id: uid('v'), hostId: user.id, listed: true, blockedDates: [], rating: 0, trips: 0, createdAt: now() };
  db.vehicles.push(v);
  commit();
  return v.id;
}

export function setVehicleListed(id: ID, listed: boolean) {
  const user = requireRole('host');
  find(getDb().vehicles, (x) => x.id === id && x.hostId === user.id, 'Vehicle').listed = listed;
  commit();
}
