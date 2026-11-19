import { accountIdFor, createTransaction, SYSTEM } from '../ledger';
import { distanceKm, PLACES, type PlaceInput, resolvePlace } from '../places';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { DriverProfile, ID, Ride, RideCategory, RideStatus } from '../types';
import { abortPayment, beginPayment, completePayment, displayName, notify, type PayMethod, previewWaveBack, publicUser, type PublicUser } from './common';
import { ratingFor } from './shop';
import { getSessionUserId, me, requireRole } from './session';

/** Hayve Ride: passenger transport (simulated dispatch). */

export const RIDE_CATEGORIES: { id: RideCategory; label: string; seats: number; multiplier: number; wait: number; blurb: string }[] = [
  { id: 'go', label: 'Hayve Go', seats: 4, multiplier: 1, wait: 4, blurb: 'Affordable everyday rides' },
  { id: 'green', label: 'Green', seats: 4, multiplier: 1, wait: 7, blurb: 'Fully electric vehicles' },
  { id: 'priority', label: 'Priority', seats: 4, multiplier: 1.18, wait: 2, blurb: 'Matched first, picked up faster' },
  { id: 'comfort', label: 'Comfort', seats: 4, multiplier: 1.4, wait: 6, blurb: 'Newer cars, extra legroom' },
  { id: 'xl', label: 'XL', seats: 6, multiplier: 1.65, wait: 8, blurb: 'Space for groups and luggage' },
];

export interface RideOption {
  waveBackCents: number;
  category: RideCategory;
  label: string;
  seats: number;
  blurb: string;
  priceCents: number;
  pickupEtaMin: number;
  durationMin: number;
  arrivalAt: number;
}

export function places() {
  return PLACES;
}

/**
 * Measured route from the Directions service. In production the API server calls
 * Mapbox Directions itself; the client value is only accepted within a sane range of
 * the straight-line estimate so it cannot be used to under-price a trip.
 */
export interface RouteMetrics {
  km: number;
  minutes: number;
}

function tripMetrics(a: { lng: number; lat: number }, b: { lng: number; lat: number }, route?: RouteMetrics) {
  const est = distanceKm(a, b);
  const km = route && route.km >= est * 0.6 && route.km <= est * 3 ? Math.round(route.km * 10) / 10 : est;
  const minutes = route && route.minutes > 0 && route.minutes < 240 ? Math.max(Math.round(route.minutes), Math.round(km * 1.2)) : Math.round(4 + km * 2.3);
  return { km, minutes };
}

export function quoteRide(pickupIn: PlaceInput, dropoffIn: PlaceInput, route?: RouteMetrics): RideOption[] {
  const a = resolvePlace(pickupIn);
  const b = resolvePlace(dropoffIn);
  assert(a && b, 'invalid', 'Choose a pickup and destination');
  assert(a.id !== b.id && distanceKm(a, b) > 0 && !(a.lng === b.lng && a.lat === b.lat), 'invalid', 'Pickup and destination must be different');
  assert(distanceKm(a, b) < 150, 'invalid', 'That destination is too far for Hayve Ride');
  const { km, minutes } = tripMetrics(a, b, route);
  return RIDE_CATEGORIES.map((c) => {
    const base = 320 + km * 145 + minutes * 30;
    const priceCents = Math.round((base * c.multiplier) / 10) * 10;
    return {
      category: c.id,
      label: c.label,
      seats: c.seats,
      blurb: c.blurb,
      priceCents: Math.max(700, priceCents),
      waveBackCents: previewWaveBack(getSessionUserId(), 'services', Math.max(700, priceCents)),
      pickupEtaMin: c.wait,
      durationMin: minutes,
      arrivalAt: now() + (c.wait + minutes) * 60_000,
    };
  });
}

export function requestRide(pickupIn: PlaceInput, dropoffIn: PlaceInput, category: RideCategory, method: PayMethod, route?: RouteMetrics) {
  const user = me();
  const db = getDb();
  const active = db.rides.find((r) => r.riderId === user.id && ['requested', 'accepted', 'arriving', 'in_progress'].includes(r.status));
  assert(!active, 'conflict', 'You already have a ride in progress');
  const option = quoteRide(pickupIn, dropoffIn, route).find((o) => o.category === category);
  assert(option, 'invalid', 'Choose a ride type');
  const pickup = resolvePlace(pickupIn)!;
  const dropoff = resolvePlace(dropoffIn)!;
  const id = uid('r');
  // Rider pays Hayve (held until the trip completes); Hayve pays the driver on completion.
  const tx = beginPayment({
    payerId: user.id,
    method,
    type: 'ride',
    credits: [{ accountId: SYSTEM.fees, amountCents: option.priceCents }],
    labelForPayer: 'Hayve Ride',
    labelForPayee: displayName(user.id),
    note: `${pickup.name} → ${dropoff.name}`,
    ref: { kind: 'ride', id },
    waveBack: { category: 'services', baseCents: option.priceCents },
  });
  const ride: Ride = {
    id,
    riderId: user.id,
    driverId: null,
    pickup,
    dropoff,
    category,
    priceCents: option.priceCents,
    distanceKm: tripMetrics(pickup, dropoff, route).km,
    durationMin: option.durationMin,
    status: 'requested',
    declinedBy: [],
    paymentTxId: tx.id,
    createdAt: now(),
    timeline: [{ status: 'requested', at: now() }],
  };
  db.rides.push(ride);
  for (const d of db.drivers.filter((x) => x.online && x.userId !== user.id)) {
    notify(d.userId, 'ride', 'New ride request', `${pickup.name} → ${dropoff.name} · €${(option.priceCents / 100).toFixed(2)}`, '/business/driver');
  }
  commit();
  return id;
}

export interface RideView extends Omit<Ride, 'riderId' | 'driverId'> {
  rider: PublicUser;
  driver: (PublicUser & { vehicle: DriverProfile['vehicle']; rating: number; trips: number }) | null;
  categoryLabel: string;
  role: 'rider' | 'driver';
}

function rideView(r: Ride, viewer: ID): RideView {
  const db = getDb();
  const role = r.riderId === viewer ? 'rider' : 'driver';
  const dp = r.driverId ? db.drivers.find((d) => d.userId === r.driverId) : null;
  const { riderId, driverId, ...rest } = r;
  return {
    ...rest,
    rider: publicUser(riderId),
    driver: dp && driverId ? { ...publicUser(driverId), vehicle: dp.vehicle, rating: ratingFor('driver', driverId).average || dp.rating, trips: dp.trips } : null,
    categoryLabel: RIDE_CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category,
    role,
  };
}

export function getRide(id: ID): RideView {
  const user = me();
  const r = find(getDb().rides, (x) => x.id === id, 'Ride');
  const isDriverViewing = user.roles.includes('driver') && (r.driverId === user.id || r.status === 'requested');
  if (r.riderId !== user.id && !isDriverViewing) throw new HayveError('not_found', 'Ride not found');
  return rideView(r, user.id);
}

export function myRides(): RideView[] {
  const user = me();
  return getDb()
    .rides.filter((r) => r.riderId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => rideView(r, user.id));
}

export function activeRide(): RideView | null {
  const user = me();
  const r = getDb().rides.find((x) => x.riderId === user.id && ['requested', 'accepted', 'arriving', 'in_progress'].includes(x.status));
  return r ? rideView(r, user.id) : null;
}

function setStatus(r: Ride, status: RideStatus) {
  r.status = status;
  r.timeline.push({ status, at: now() });
}

function completeRide(r: Ride) {
  const db = getDb();
  setStatus(r, 'completed');
  const tx = db.transactions.find((t) => t.id === r.paymentTxId);
  if (tx && tx.status === 'reserved') completePayment(tx, 'posted');
  if (r.driverId) {
    createTransaction({
      type: 'earning',
      fromAccountId: SYSTEM.fees,
      credits: [{ accountId: accountIdFor(r.driverId), amountCents: Math.round(r.priceCents * 0.8) }],
      labelForFrom: displayName(r.driverId),
      labelForTo: 'Hayve Ride earnings',
      note: `${r.pickup.name} → ${r.dropoff.name}`,
      method: 'system',
      ref: { kind: 'ride', id: r.id },
    });
    const dp = db.drivers.find((d) => d.userId === r.driverId);
    if (dp) dp.trips += 1;
  }
  notify(r.riderId, 'ride', 'You have arrived', `Trip to ${r.dropoff.name} · €${(r.priceCents / 100).toFixed(2)}`, `/ride/${r.id}`);
}

export function cancelRide(id: ID) {
  const user = me();
  const db = getDb();
  const r = find(db.rides, (x) => x.id === id && x.riderId === user.id, 'Ride');
  assert(['requested', 'accepted', 'arriving'].includes(r.status), 'conflict', 'This ride can no longer be cancelled');
  setStatus(r, 'cancelled');
  abortPayment(db.transactions.find((t) => t.id === r.paymentTxId));
  if (r.driverId) notify(r.driverId, 'ride', 'Ride cancelled', 'The passenger cancelled the trip.', '/business/driver');
  commit();
}

export function rateRide(id: ID, rating: number, text = '') {
  const user = me();
  const db = getDb();
  const r = find(db.rides, (x) => x.id === id && x.riderId === user.id, 'Ride');
  assert(r.status === 'completed', 'conflict', 'You can rate a ride once it is complete');
  assert(rating >= 1 && rating <= 5, 'invalid', 'Rating must be 1–5');
  r.rating = rating;
  if (r.driverId) db.reviews.push({ id: uid('rv'), authorId: user.id, targetKind: 'driver', targetId: r.driverId, rating, text, createdAt: now() });
  commit();
}

/**
 * Simulated dispatch: advances a ride one step (assign → arrive → start → finish).
 * Used by the tracking screen to animate a trip when no real driver acts on it.
 */
export function simulateRideStep(id: ID) {
  const user = me();
  const db = getDb();
  const r = find(db.rides, (x) => x.id === id && x.riderId === user.id, 'Ride');
  switch (r.status) {
    case 'requested': {
      const driver = db.drivers.find((d) => d.online && d.userId !== r.riderId && !r.declinedBy.includes(d.userId)) ?? db.drivers.find((d) => d.userId !== r.riderId);
      if (!driver) return r.status;
      r.driverId = driver.userId;
      setStatus(r, 'accepted');
      notify(r.riderId, 'ride', 'Driver on the way', `${displayName(driver.userId)} · ${driver.vehicle.color} ${driver.vehicle.make} ${driver.vehicle.model} · ${driver.vehicle.plate}`, `/ride/${r.id}`);
      break;
    }
    case 'accepted':
      setStatus(r, 'arriving');
      break;
    case 'arriving':
      setStatus(r, 'in_progress');
      break;
    case 'in_progress':
      completeRide(r);
      break;
  }
  commit();
  return r.status;
}

/* ----------------------------------------------------- Hayve Driver -- */

export function registerDriver(input: { make: string; model: string; color: string; plate: string; licenseNumber: string; category: RideCategory }) {
  const user = me();
  const db = getDb();
  assert(input.make.trim() && input.model.trim() && input.color.trim(), 'invalid', 'Enter your vehicle details');
  assert(/^[A-Z0-9-]{4,10}$/i.test(input.plate.trim()), 'invalid', 'Enter a valid number plate');
  assert(input.licenseNumber.trim().length >= 5, 'invalid', 'Enter your driving licence number');
  if (!db.drivers.some((d) => d.userId === user.id)) {
    db.drivers.push({
      userId: user.id,
      vehicle: { make: input.make.trim(), model: input.model.trim(), color: input.color.trim(), plate: input.plate.trim().toUpperCase(), category: input.category },
      licenseNumber: input.licenseNumber.trim(),
      online: false,
      rating: 5,
      trips: 0,
    });
  }
  if (!user.roles.includes('driver')) user.roles.push('driver');
  commit();
}

export function driverProfile() {
  const user = requireRole('driver');
  return getDb().drivers.find((d) => d.userId === user.id) ?? null;
}

export function setDriverOnline(online: boolean) {
  const user = requireRole('driver');
  const d = find(getDb().drivers, (x) => x.userId === user.id, 'Driver profile');
  d.online = online;
  commit();
}

export function driverQueue(): RideView[] {
  const user = requireRole('driver');
  const db = getDb();
  const d = db.drivers.find((x) => x.userId === user.id);
  if (!d?.online) return [];
  return db.rides
    .filter((r) => r.status === 'requested' && r.riderId !== user.id && !r.declinedBy.includes(user.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => rideView(r, user.id));
}

export function driverTrips(): RideView[] {
  const user = requireRole('driver');
  return getDb()
    .rides.filter((r) => r.driverId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => rideView(r, user.id));
}

export function driverAccept(id: ID) {
  const user = requireRole('driver');
  const db = getDb();
  const r = find(db.rides, (x) => x.id === id, 'Ride');
  assert(r.status === 'requested', 'conflict', 'This ride was taken by another driver');
  assert(!db.rides.some((x) => x.driverId === user.id && ['accepted', 'arriving', 'in_progress'].includes(x.status)), 'conflict', 'Finish your current trip first');
  r.driverId = user.id;
  setStatus(r, 'accepted');
  const d = db.drivers.find((x) => x.userId === user.id)!;
  notify(r.riderId, 'ride', 'Driver on the way', `${displayName(user.id)} · ${d.vehicle.color} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plate}`, `/ride/${r.id}`);
  commit();
}

export function driverDecline(id: ID) {
  const user = requireRole('driver');
  const r = find(getDb().rides, (x) => x.id === id, 'Ride');
  if (!r.declinedBy.includes(user.id)) r.declinedBy.push(user.id);
  commit();
}

export function driverAdvance(id: ID) {
  const user = requireRole('driver');
  const r = find(getDb().rides, (x) => x.id === id && x.driverId === user.id, 'Ride');
  if (r.status === 'accepted') setStatus(r, 'arriving');
  else if (r.status === 'arriving') setStatus(r, 'in_progress');
  else if (r.status === 'in_progress') completeRide(r);
  else throw new HayveError('conflict', 'Nothing to update');
  commit();
}

/** Wave Back earned on a ride (0 when paid by card or capped). */
export function waveBackForRide(id: ID) {
  const user = me();
  const db = getDb();
  const r = db.rides.find((x) => x.id === id && x.riderId === user.id);
  const tx = r && db.transactions.find((t) => t.id === r.paymentTxId);
  return tx?.waveBackCents ?? 0;
}
