import { fmtMoney, region } from '../regions';
import { accountIdFor, createTransaction, SYSTEM } from '../ledger';
import { distanceKm, haversineKm, PLACES, placesNear, type PlaceInput, resolvePlace } from '../places';
import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { DriverProfile, ID, Ride, RideCategory, RideStatus } from '../types';
import { abortPayment, beginPayment, completePayment, displayName, notify, type PayMethod, previewWaveBack, publicUser, type PublicUser, settings } from './common';
import { ratingFor } from './shop';
import { disclosed, priceFor, pricingState, recordPrice } from './revenue';
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
  /** What the rider pays, all disclosed fees included. */
  priceCents: number;
  /** Fare before fees (what the driver's share is based on). */
  baseCents: number;
  /** Fees on top of the fare, shown before booking (booking fee, airport fee, busy-time price…). */
  fees: { label: string; cents: number }[];
  pickupEtaMin: number;
  durationMin: number;
  arrivalAt: number;
}

/** Saved places (Home, Studio) belong to the demo account in this build. */
const SAVED = new Set(['home', 'work']);

function visible(p: { id: string }) {
  return !SAVED.has(p.id) || getSessionUserId() === 'u_sam';
}

/** Where the map starts when the device location is unknown: your saved home, else your country's main city. */
export function startPoint() {
  const uid = getSessionUserId();
  const home = uid === 'u_sam' ? PLACES.find((p) => p.id === 'home') : null;
  if (home) return { lng: home.lng, lat: home.lat, name: home.name };
  const country = uid ? getDb().profiles.find((p) => p.userId === uid)?.country : null;
  return region(country).city;
}

/** Quick picks near a point (saved places first). Ride itself works anywhere via map search. */
export function places(near?: { lng: number; lat: number }) {
  const center = near ?? startPoint();
  const saved = PLACES.filter((p) => SAVED.has(p.id) && visible(p) && haversineKm(center, p) < 80);
  return [...saved, ...placesNear(center, 14).filter((p) => !SAVED.has(p.id))];
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
  // Market-wide context only: where, when, demand near the pickup and events. Never who you are.
  const ctx = { points: [a, b], demand: demandAt(a), distanceKm: km };
  return RIDE_CATEGORIES.map((c) => {
    const fare = Math.max(700, Math.round(((320 + km * 145 + minutes * 30) * c.multiplier) / 10) * 10);
    const price = priceFor('ride', fare, ctx);
    return {
      category: c.id,
      label: c.label,
      seats: c.seats,
      blurb: c.blurb,
      priceCents: price.customerTotalCents,
      baseCents: fare,
      fees: disclosed(price),
      waveBackCents: previewWaveBack(getSessionUserId(), 'services', fare),
      pickupEtaMin: c.wait,
      durationMin: minutes,
      arrivalAt: now() + (c.wait + minutes) * 60_000,
    };
  });
}

/** Ride requests waiting nearby ÷ free online drivers nearby (a market signal, not personal). */
export function demandAt(p: { lng: number; lat: number }) {
  const db = getDb();
  const busy = new Set(db.rides.filter((x) => x.driverId && ACTIVE.includes(x.status)).map((x) => x.driverId));
  const free = db.drivers.filter((d) => d.online && !busy.has(d.userId) && (!d.location || haversineKm(d.location, p) < 8)).length;
  const waiting = db.rides.filter((x) => x.status === 'requested' && haversineKm(x.pickup, p) < 8 && now() - x.createdAt < 15 * 60_000).length;
  return (waiting + 1) / Math.max(1, free);
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
  // The same price the rider saw: re-priced with the same context and recorded for audit.
  const km = tripMetrics(pickup, dropoff, route).km;
  const ctx = { points: [pickup, dropoff], demand: demandAt(pickup), distanceKm: km };
  const price = priceFor('ride', option.baseCents, ctx);
  assert(price.customerTotalCents === option.priceCents, 'conflict', 'The price just changed. Check the new price and request again.');
  const commissionCents = price.supplierLines.reduce((a, l) => a + l.cents, 0);
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
    waveBack: { category: 'services', baseCents: option.baseCents },
  });
  const recordId = recordPrice('ride', id, price, ctx);
  const ride: Ride = {
    id,
    riderId: user.id,
    driverId: null,
    pickup,
    dropoff,
    category,
    priceCents: option.priceCents,
    distanceKm: km,
    durationMin: option.durationMin,
    pricing: { baseCents: option.baseCents, lines: option.fees, commissionCents, recordId },
    status: 'requested',
    declinedBy: [],
    paymentTxId: tx.id,
    createdAt: now(),
    timeline: [{ status: 'requested', at: now() }],
  };
  db.rides.push(ride);
  // Dispatch: offer the trip to the best nearby driver first (see offerNext).
  offerNext(ride);
  commit();
  return id;
}

/* ------------------------------------------------------------ dispatch -- */

const ACTIVE: RideStatus[] = ['accepted', 'arriving', 'in_progress'];
/** Average city speed used for pickup estimates (km/h), incl. traffic lights. */
const CITY_KMH = 22;

/** Which vehicles may serve a ride category. */
function serves(vehicle: RideCategory, wanted: RideCategory) {
  if (wanted === 'go' || wanted === 'priority') return true;
  if (wanted === 'comfort') return vehicle === 'comfort';
  return vehicle === wanted;
}

function pickupEta(d: DriverProfile, r: Ride) {
  if (!d.location) return 9;
  return Math.max(1, Math.round(((distanceKm(d.location, r.pickup) * 1.35) / CITY_KMH) * 60));
}

/**
 * Drivers who could take a ride, best first: online, free, not the rider, haven't turned it down,
 * vehicle fits the category; ranked by pickup time, then rating.
 */
/** Demo drivers far from the pickup are placed a short drive away, so Ride works in any city. */
function bringDemoDriversClose(r: Ride) {
  const db = getDb();
  db.drivers.forEach((d, i) => {
    if (!d.demo || (d.location && haversineKm(d.location, r.pickup) < 25)) return;
    const angle = ((i * 97 + 30) % 360) * (Math.PI / 180);
    const km = 0.6 + ((i * 37) % 30) / 10; // 0.6–3.5 km away
    d.location = { lng: r.pickup.lng + (Math.cos(angle) * km) / (111 * Math.cos((r.pickup.lat * Math.PI) / 180)), lat: r.pickup.lat + (Math.sin(angle) * km) / 111, at: now() };
  });
}

export function rankDrivers(r: Ride) {
  const db = getDb();
  bringDemoDriversClose(r);
  const busy = new Set(db.rides.filter((x) => x.driverId && ACTIVE.includes(x.status)).map((x) => x.driverId));
  const free = db.drivers.filter((d) => d.online && d.userId !== r.riderId && !busy.has(d.userId) && !r.declinedBy.includes(d.userId));
  const fitting = free.filter((d) => serves(d.vehicle.category, r.category));
  return (fitting.length ? fitting : free).map((d) => ({ driver: d, etaMin: pickupEta(d, r) })).sort((a, b) => a.etaMin - b.etaMin || b.driver.rating - a.driver.rating);
}

/** Offers the trip to the next best driver for a limited time. Returns false when nobody is left. */
function offerNext(r: Ride) {
  const next = rankDrivers(r)[0];
  if (!next) {
    r.offer = null;
    return false;
  }
  const secs = settings().ride.offerSeconds;
  r.offer = { driverId: next.driver.userId, expiresAt: now() + secs * 1000, etaMin: next.etaMin };
  r.offers = [...(r.offers ?? []), { driverId: next.driver.userId, at: now(), outcome: 'pending', etaMin: next.etaMin }];
  notify(next.driver.userId, 'ride', 'New ride request', `${r.pickup.name} → ${r.dropoff.name} · ${next.etaMin} min away · answer within ${secs} s`, '/business/driver');
  return true;
}

function closeOffer(r: Ride, outcome: 'accepted' | 'declined' | 'timeout') {
  const last = r.offers?.[r.offers.length - 1];
  if (last && last.outcome === 'pending') last.outcome = outcome;
  if (outcome !== 'accepted' && r.offer && !r.declinedBy.includes(r.offer.driverId)) r.declinedBy.push(r.offer.driverId);
  r.offer = null;
}

/** Moves an unanswered offer on to the next driver. Safe to call any time. */
function expireOffer(r: Ride) {
  if (r.status !== 'requested' || !r.offer || r.offer.expiresAt > now()) return false;
  closeOffer(r, 'timeout');
  offerNext(r);
  return true;
}

function assign(r: Ride, driverId: ID) {
  const db = getDb();
  closeOffer(r, 'accepted');
  r.driverId = driverId;
  setStatus(r, 'accepted');
  const d = db.drivers.find((x) => x.userId === driverId)!;
  notify(r.riderId, 'ride', `${displayName(driverId).split(' ')[0]} is on the way`, `${d.vehicle.color} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plate}`, `/ride/${r.id}`);
}

export interface RideView extends Omit<Ride, 'riderId' | 'driverId' | 'offers' | 'offer'> {
  rider: PublicUser;
  driver: (PublicUser & { vehicle: DriverProfile['vehicle']; rating: number; trips: number; location?: DriverProfile['location'] }) | null;
  categoryLabel: string;
  role: 'rider' | 'driver';
  /** Dispatch progress the rider sees while we look for a driver. */
  matching: { contacted: number; declined: number; current: { firstName: string; etaMin: number; secondsLeft: number } | null; noneLeft: boolean };
  /** For the driver: the fare split once accepted (driver keeps fare minus commission). */
  split: { driverCents: number; hayveCents: number; commissionRate: number };
  /** For the driver being offered the trip: seconds left to answer. */
  offerSecondsLeft: number | null;
}

function rideView(r: Ride, viewer: ID): RideView {
  const db = getDb();
  const role = r.riderId === viewer ? 'rider' : 'driver';
  const dp = r.driverId ? db.drivers.find((d) => d.userId === r.driverId) : null;
  const { riderId, driverId, offers, offer, ...rest } = r;
  const rate = settings().ride.commissionRate;
  const fare = r.pricing?.baseCents ?? r.priceCents;
  const commission = r.pricing?.commissionCents ?? Math.round(fare * rate);
  const hayveCents = r.payout?.hayveCents ?? r.priceCents - (fare - commission);
  const offerDriver = offer ? db.drivers.find((d) => d.userId === offer.driverId) : null;
  return {
    ...rest,
    rider: publicUser(riderId),
    driver: dp && driverId ? { ...publicUser(driverId), vehicle: dp.vehicle, rating: ratingFor('driver', driverId).average || dp.rating, trips: dp.trips, location: dp.location } : null,
    categoryLabel: RIDE_CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category,
    role,
    matching: {
      contacted: offers?.length ?? 0,
      declined: offers?.filter((o) => o.outcome === 'declined' || o.outcome === 'timeout').length ?? 0,
      current: offer && offerDriver ? { firstName: displayName(offer.driverId).split(' ')[0], etaMin: offer.etaMin, secondsLeft: Math.max(0, Math.ceil((offer.expiresAt - now()) / 1000)) } : null,
      noneLeft: r.status === 'requested' && !offer,
    },
    split: { driverCents: r.payout?.driverCents ?? fare - commission, hayveCents, commissionRate: fare ? commission / fare : rate },
    offerSecondsLeft: offer && offer.driverId === viewer ? Math.max(0, Math.ceil((offer.expiresAt - now()) / 1000)) : null,
  };
}

export function getRide(id: ID): RideView {
  const user = me();
  const r = find(getDb().rides, (x) => x.id === id, 'Ride');
  const isDriverViewing = user.roles.includes('driver') && (r.driverId === user.id || (r.status === 'requested' && r.offer?.driverId === user.id));
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
    // The driver keeps the fare minus Hayve's commission; disclosed fees (booking, airport…) stay with
    // Hayve. Both come from the price recorded at booking.
    const fare = r.pricing?.baseCents ?? r.priceCents;
    const commission = r.pricing?.commissionCents ?? Math.round(fare * settings().ride.commissionRate);
    r.payout = { driverCents: fare - commission, hayveCents: r.priceCents - (fare - commission) };
    createTransaction({
      type: 'earning',
      fromAccountId: SYSTEM.fees,
      credits: [{ accountId: accountIdFor(r.driverId), amountCents: r.payout.driverCents }],
      labelForFrom: displayName(r.driverId),
      labelForTo: 'Hayve Ride earnings',
      note: `${r.pickup.name} → ${r.dropoff.name}`,
      method: 'system',
      ref: { kind: 'ride', id: r.id },
    });
    const dp = db.drivers.find((d) => d.userId === r.driverId);
    if (dp) dp.trips += 1;
    // Waiting time at pickup beyond the free minutes goes to the driver (disclosed at booking).
    const arrived = r.timeline.find((t) => t.status === 'arriving')?.at;
    const started = r.timeline.find((t) => t.status === 'in_progress')?.at;
    const waitRule = pricingState().rules.find((x) => x.id === 'ride_waiting' && x.enabled);
    const paidMinutes = arrived && started ? Math.floor((started - arrived) / 60_000) - FREE_WAIT_MIN : 0;
    if (waitRule && paidMinutes > 0) chargeExtra(r, `Waiting time · ${paidMinutes} min`, paidMinutes * waitRule.amount.value);
  }
  notify(r.riderId, 'ride', 'You have arrived', `Trip to ${r.dropoff.name} · ${fmtMoney(r.priceCents)}`, `/ride/${r.id}`);
}

export function cancelRide(id: ID) {
  const user = me();
  const db = getDb();
  const r = find(db.rides, (x) => x.id === id && x.riderId === user.id, 'Ride');
  assert(['requested', 'accepted', 'arriving'].includes(r.status), 'conflict', 'This ride can no longer be cancelled');
  // Late cancellation (driver accepted more than 2 minutes ago): the disclosed fee goes to the driver.
  const acceptedAt = r.timeline.find((t) => t.status === 'accepted')?.at;
  const cancelRule = pricingState().rules.find((x) => x.id === 'ride_cancel' && x.enabled);
  const late = !!(r.driverId && acceptedAt && now() - acceptedAt > FREE_CANCEL_MS && cancelRule);
  setStatus(r, 'cancelled');
  if (r.offer) closeOffer(r, 'timeout');
  abortPayment(db.transactions.find((t) => t.id === r.paymentTxId));
  if (late) chargeExtra(r, 'Late cancellation fee', cancelRule!.amount.value);
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
      if (expireOffer(r)) break;
      if (!r.offer) {
        // Everyone turned it down: start a new round with all drivers.
        r.declinedBy = [];
        offerNext(r);
        break;
      }
      // The offered driver answers. In the simulation the first driver turns some trips down,
      // so the hand-over to the next driver is visible.
      const seed = [...r.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
      if ((r.offers?.length ?? 0) === 1 && seed % 2 === 0 && rankDrivers(r).length > 1) {
        closeOffer(r, 'declined');
        offerNext(r);
      } else assign(r, r.offer.driverId);
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

/** Minutes a driver waits for free, and how long after acceptance a cancellation is free. */
export const FREE_WAIT_MIN = 3;
export const FREE_CANCEL_MS = 2 * 60_000;

/** Charges a disclosed extra (waiting time, late cancellation) and pays it to the driver. */
function chargeExtra(r: Ride, label: string, cents: number) {
  if (!r.driverId || cents <= 0) return;
  const tx = beginPayment({
    payerId: r.riderId,
    method: 'wallet_card',
    type: 'ride',
    credits: [{ accountId: accountIdFor(r.driverId), amountCents: cents }],
    labelForPayer: 'Hayve Ride',
    labelForPayee: displayName(r.riderId),
    note: label,
    ref: { kind: 'ride', id: r.id },
  });
  completePayment(tx, 'posted');
  r.extraCharges = [...(r.extraCharges ?? []), { label, cents, txId: tx.id }];
  notify(r.riderId, 'ride', label, `${fmtMoney(cents)} for your trip with ${displayName(r.driverId).split(' ')[0]}`, `/ride/${r.id}`);
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
  let moved = false;
  for (const r of db.rides) if (expireOffer(r)) moved = true;
  if (moved) commit();
  // Hayve sends each request to one suitable driver at a time.
  return db.rides
    .filter((r) => r.status === 'requested' && r.offer?.driverId === user.id)
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
  expireOffer(r);
  assert(r.status === 'requested', 'conflict', 'This ride was taken by another driver');
  assert(r.offer?.driverId === user.id, 'conflict', 'This request went to another driver');
  assert(!db.rides.some((x) => x.driverId === user.id && ACTIVE.includes(x.status)), 'conflict', 'Finish your current trip first');
  assign(r, user.id);
  commit();
}

export function driverDecline(id: ID) {
  const user = requireRole('driver');
  const r = find(getDb().rides, (x) => x.id === id, 'Ride');
  if (r.status === 'requested' && r.offer?.driverId === user.id) {
    closeOffer(r, 'declined');
    offerNext(r);
  } else if (!r.declinedBy.includes(user.id)) r.declinedBy.push(user.id);
  commit();
}

/** The driver's phone shares its GPS position while online (shown live on the passenger's map). */
export function driverUpdateLocation(lng: number, lat: number, heading?: number) {
  const user = requireRole('driver');
  assert(Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180, 'invalid', 'Invalid location');
  const d = find(getDb().drivers, (x) => x.userId === user.id, 'Driver profile');
  d.location = { lng, lat, heading, at: now() };
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
