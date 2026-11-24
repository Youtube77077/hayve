import { haversineKm } from '../places';
import { accountIdFor, releaseTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, now, reference, uid } from '../store';
import type { HolidayBoard, HolidayBooking, HolidayPackage, ID } from '../types';
import { beginPayment, completePayment, displayName, isoDate, notify, type PayMethod } from './common';
import { disclosed, priceFor, recordPrice } from './revenue';
import { getSessionUserId, me } from './session';

/**
 * Hayve Holidays: package holidays (flights, hotel, transfers, meals) sold by travel partners.
 * Hayve takes the booking and support; the partner runs the trip and is paid when it's over.
 * After the trip we ask how it was and offer a shareable trip map (like a run on Strava).
 */

export const BOARD_LABEL: Record<HolidayBoard, string> = { all_inclusive: 'All inclusive', half_board: 'Half board', breakfast: 'Breakfast included' };

const pkgs = () => getDb().holidays ?? [];
const bookings = () => (getDb().holidayBookings ??= []);

export interface HolidayQuery {
  q?: string;
  board?: HolidayBoard;
  tag?: string;
  sort?: 'recommended' | 'price_asc' | 'rating';
}

export function listHolidays(query: HolidayQuery = {}) {
  const q = query.q?.trim().toLowerCase();
  let rows = pkgs().filter((p) => {
    if (query.board && p.board !== query.board) return false;
    if (query.tag && !p.tags.includes(query.tag)) return false;
    if (q && !`${p.title} ${p.hotel} ${p.city} ${p.country} ${p.tags.join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (query.sort === 'price_asc') rows = [...rows].sort((a, b) => a.pricePerPersonCents - b.pricePerPersonCents);
  else if (query.sort === 'rating') rows = [...rows].sort((a, b) => b.rating - a.rating);
  else rows = [...rows].sort((a, b) => b.rating * Math.log(b.reviewCount + 2) - a.rating * Math.log(a.reviewCount + 2));
  return rows;
}

export function getHoliday(id: ID) {
  const p = find(pkgs(), (x) => x.id === id, 'Holiday');
  const today = isoDate(new Date(now()));
  return { ...p, departures: p.departures.filter((d) => d > today), boardLabel: BOARD_LABEL[p.board] };
}

const addDaysISO = (iso: string, days: number) => isoDate(new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000));

/** Price for a departure and number of travellers. Buyers see the package price and one "Fees" amount. */
export function quoteHoliday(id: ID, departure: string, travellers: number) {
  const p = find(pkgs(), (x) => x.id === id, 'Holiday');
  assert(Number.isInteger(travellers) && travellers >= 1 && travellers <= 9, 'invalid', 'Choose 1 to 9 travellers');
  const base = p.pricePerPersonCents * travellers;
  const price = priceFor('holiday', base, { points: [{ lng: p.lng, lat: p.lat, name: p.city }] });
  const feesCents = price.customerTotalCents - base;
  return {
    breakdown: price,
    fees: disclosed(price),
    perPersonCents: p.pricePerPersonCents,
    baseCents: base,
    feesCents,
    totalCents: price.customerTotalCents,
    commissionCents: price.supplierLines.reduce((a, l) => a + l.cents, 0),
    nights: p.nights,
    returnDate: addDaysISO(departure, p.nights),
  };
}

export function bookHoliday(input: { packageId: ID; departure: string; travellers: number; method: PayMethod }) {
  const user = me();
  const p = find(pkgs(), (x) => x.id === input.packageId, 'Holiday');
  assert(p.partnerId !== user.id, 'invalid', "You can't book your own package");
  assert(p.departures.includes(input.departure), 'invalid', 'Pick one of the available departure dates');
  assert(input.departure > isoDate(new Date(now())), 'invalid', 'That departure date has passed. Pick a later one.');
  const q = quoteHoliday(p.id, input.departure, input.travellers);
  const id = uid('hb');
  const partnerShare = q.baseCents - q.commissionCents;
  const tx = beginPayment({
    payerId: user.id,
    method: input.method,
    type: 'stay',
    // The partner is paid when the trip is over (held until then, like a stay).
    credits: [
      { accountId: accountIdFor(p.partnerId), amountCents: partnerShare, status: 'pending' },
      { accountId: SYSTEM.fees, amountCents: q.totalCents - partnerShare },
    ],
    labelForPayer: `${p.city} holiday · ${p.partnerName}`,
    labelForPayee: `Hayve Holidays · ${displayName(user.id)}`,
    note: `${input.departure} → ${q.returnDate} · ${input.travellers} traveller${input.travellers > 1 ? 's' : ''}`,
    ref: { kind: 'holiday', id },
    waveBack: { category: 'services', baseCents: q.baseCents },
  });
  completePayment(tx, 'pending');
  recordPrice('holiday', id, q.breakdown, { points: [{ lng: p.lng, lat: p.lat, name: p.city }] });
  const b: HolidayBooking = { id, reference: reference('HH'), packageId: p.id, userId: user.id, partnerId: p.partnerId, departure: input.departure, returnDate: q.returnDate, travellers: input.travellers, totalCents: q.totalCents, status: 'confirmed', paymentTxId: tx.id, createdAt: now() };
  bookings().push(b);
  notify(user.id, 'stay', 'Holiday booked', `${p.title} · ${input.departure} · ${b.reference}`, `/holidays/trip/${id}`);
  notify(p.partnerId, 'business', 'New holiday booking', `${p.hotel} · ${input.departure} · ${input.travellers} travellers`, '/business');
  commit();
  return id;
}

/** Trips whose return date has passed are completed: the partner is paid and we ask how it was (once). */
function settleTrips(userId: ID) {
  const today = isoDate(new Date(now()));
  let changed = false;
  for (const b of bookings()) {
    if (b.userId !== userId || b.status !== 'confirmed' || b.returnDate >= today) continue;
    b.status = 'completed';
    b.completedAt = now();
    if (b.paymentTxId) releaseTransaction(b.paymentTxId);
    const p = pkgs().find((x) => x.id === b.packageId);
    notify(userId, 'stay', `Welcome back from ${p?.city ?? 'your trip'}!`, 'How was it? Rate your trip and get your trip map to share.', `/holidays/trip/${b.id}`);
    changed = true;
  }
  if (changed) commit();
}

export interface TripView extends HolidayBooking {
  package: HolidayPackage & { boardLabel: string };
  /** Trip over and not rated yet: show "How was your trip?". */
  needsReview: boolean;
}

function view(b: HolidayBooking): TripView {
  const p = find(pkgs(), (x) => x.id === b.packageId, 'Holiday');
  return { ...b, package: { ...p, boardLabel: BOARD_LABEL[p.board] }, needsReview: b.status === 'completed' && !b.review };
}

export function myTrips(): TripView[] {
  const user = me();
  settleTrips(user.id);
  return bookings()
    .filter((b) => b.userId === user.id)
    .sort((a, b) => b.departure.localeCompare(a.departure))
    .map(view);
}

export function getTrip(id: ID): TripView {
  const user = me();
  settleTrips(user.id);
  return view(find(bookings(), (b) => b.id === id && b.userId === user.id, 'Trip'));
}

/** The trip waiting for a rating (shown on Home until answered). Null when signed out. */
export function tripToRate(): TripView | null {
  const uid_ = getSessionUserId();
  if (!uid_) return null;
  settleTrips(uid_);
  const b = bookings().find((x) => x.userId === uid_ && x.status === 'completed' && !x.review);
  return b ? view(b) : null;
}

export function rateTrip(id: ID, stars: number, comment?: string) {
  const user = me();
  const b = find(bookings(), (x) => x.id === id && x.userId === user.id, 'Trip');
  settleTrips(user.id);
  assert(b.status === 'completed', 'invalid', 'You can rate your trip once you are back home');
  assert(!b.review, 'conflict', 'You already rated this trip');
  assert(Number.isInteger(stars) && stars >= 1 && stars <= 5, 'invalid', 'Pick 1 to 5 stars');
  b.review = { stars, comment: comment?.trim().slice(0, 500) || undefined, at: now() };
  const p = find(pkgs(), (x) => x.id === b.packageId, 'Holiday');
  p.rating = Math.round(((p.rating * p.reviewCount + stars) / (p.reviewCount + 1)) * 100) / 100;
  p.reviewCount += 1;
  notify(p.partnerId, 'business', `New ${stars}-star review`, `${p.hotel}${b.review.comment ? ` · "${b.review.comment.slice(0, 80)}"` : ''}`, '/business');
  commit();
}

/* ------------------------------------------------------ trip map -- */

export interface TripMap {
  /** Stops in order; the app draws real road routes between them. */
  stops: { name: string; lng: number; lat: number; kind: 'airport' | 'hotel' | 'place' }[];
  /** Straight-line estimate; the app replaces it with the routed distance. */
  estimateKm: number;
  places: number;
  days: number;
}

/** Which nearby places this trip visited (stable per booking). */
function visited(p: HolidayPackage, bookingId: string) {
  const seed = [...bookingId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const n = Math.min(p.places.length, 3 + (seed % Math.max(1, p.places.length - 2)));
  return [...p.places].sort((a, b) => ((a.name.length * 31 + seed) % 7) - ((b.name.length * 31 + seed) % 7)).slice(0, n);
}

function tripMap(b: HolidayBooking, p: HolidayPackage, includeHotel: boolean): TripMap {
  const hotel = { name: p.hotel, lng: p.lng, lat: p.lat, kind: 'hotel' as const };
  const airport = { ...p.airport, kind: 'airport' as const };
  const places = visited(p, b.id).map((x) => ({ ...x, kind: 'place' as const }));
  // Public maps leave out the hotel, so a shared trip never shows where someone slept.
  const stops = includeHotel ? [airport, hotel, ...places, hotel, airport] : [airport, ...places, airport];
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += haversineKm(stops[i - 1], stops[i]) * 1.3;
  return { stops, estimateKm: Math.round(km), places: places.length, days: p.nights + 1 };
}

/** The traveller's own trip map (with the hotel). */
export function myTripMap(id: ID): TripMap {
  const t = getTrip(id);
  return tripMap(t, t.package, true);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Creates (once) the short public link for a finished trip: hayve.app/t/CODE. */
export function shareTrip(id: ID): string {
  const user = me();
  const b = find(bookings(), (x) => x.id === id && x.userId === user.id, 'Trip');
  settleTrips(user.id);
  assert(b.status === 'completed', 'invalid', 'You can share your trip once you are back home');
  if (!b.shareCode) {
    const p = find(pkgs(), (x) => x.id === b.packageId, 'Holiday');
    const prefix = p.city.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    let code = '';
    do {
      code = prefix;
      for (let i = 0; i < 2; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    } while (bookings().some((x) => x.shareCode === code));
    b.shareCode = code;
    commit();
  }
  return b.shareCode;
}

/** What anyone with the link sees: first name, destination, the map without the hotel. No account needed. */
export function publicTrip(code: string) {
  const b = find(bookings(), (x) => !!x.shareCode && x.shareCode === code.trim().toUpperCase(), 'Trip');
  const p = find(pkgs(), (x) => x.id === b.packageId, 'Holiday');
  return {
    code: b.shareCode!,
    firstName: displayName(b.userId).split(' ')[0],
    city: p.city,
    country: p.country,
    month: new Date(`${b.departure}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    nights: p.nights,
    stars: b.review?.stars ?? null,
    packageId: p.id,
    map: tripMap(b, p, false),
  };
}
