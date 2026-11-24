import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../src/backend/api';
import { accountIdFor, balancesFor, ledgerIsBalanced } from '../src/backend/ledger';
import { createSeedDatabase, DEMO_PASSWORD } from '../src/backend/seed';
import { attachStorage, getDb } from '../src/backend/store';
import { fitToBox, lineKm, type LngLat, metersBetween, trimPrivacy } from '../src/features/holidays/trip';

const as = (email: string) => api.session.signIn(email, DEMO_PASSWORD);

beforeEach(() => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
});

describe('Hayve Holidays', () => {
  it('lists partner packages anyone can browse, with filters', () => {
    const all = api.holidays.listHolidays();
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(api.holidays.listHolidays({ board: 'all_inclusive' }).every((h) => h.board === 'all_inclusive')).toBe(true);
    expect(api.holidays.listHolidays({ q: 'lisbon' }).map((h) => h.id)).toEqual(['hol_lisbon']);
    const cheap = api.holidays.listHolidays({ sort: 'price_asc' });
    expect(cheap[0].pricePerPersonCents).toBeLessThanOrEqual(cheap[cheap.length - 1].pricePerPersonCents);
    expect(api.holidays.getHoliday('hol_crete').departures.length).toBeGreaterThan(0);
  });

  it('quotes per traveller with one Fees amount, and books with the partner paid after the trip', () => {
    as('noor@hayve.app');
    const h = api.holidays.getHoliday('hol_mallorca');
    const q = api.holidays.quoteHoliday(h.id, h.departures[0], 2);
    expect(q.baseCents).toBe(h.pricePerPersonCents * 2);
    expect(q.feesCents).toBe(1499);
    expect(q.totalCents).toBe(q.baseCents + 1499);
    expect(() => api.holidays.quoteHoliday(h.id, h.departures[0], 0)).toThrow(/1 to 9/);
    const before = balancesFor(accountIdFor('u_sunway'));
    const id = api.holidays.bookHoliday({ packageId: h.id, departure: h.departures[0], travellers: 2, method: 'card' });
    const after = balancesFor(accountIdFor('u_sunway'));
    expect(after.pending - before.pending).toBe(q.baseCents - q.commissionCents);
    expect(after.available).toBe(before.available);
    expect(api.holidays.getTrip(id).status).toBe('confirmed');
    expect(getDb().priceRecords!.some((r) => r.refId === id && r.service === 'holiday')).toBe(true);
    expect(ledgerIsBalanced()).toBe(true);
    expect(() => api.holidays.bookHoliday({ packageId: h.id, departure: '2001-01-01', travellers: 1, method: 'card' })).toThrow(/departure/);
  });

  it('asks how the trip was once it is over, once, and takes one rating', () => {
    as('sam@hayve.app');
    const t = api.holidays.tripToRate();
    expect(t?.id).toBe('hb_seed_lisbon');
    expect(t?.status).toBe('completed');
    const welcome = getDb().notifications.filter((n) => n.userId === 'u_sam' && n.title.startsWith('Welcome back from Lisbon'));
    expect(welcome).toHaveLength(1);
    api.holidays.myTrips();
    expect(getDb().notifications.filter((n) => n.userId === 'u_sam' && n.title.startsWith('Welcome back')).length).toBe(1);
    expect(() => api.holidays.rateTrip(t!.id, 6)).toThrow(/1 to 5/);
    const before = api.holidays.getHoliday('hol_lisbon').reviewCount;
    api.holidays.rateTrip(t!.id, 5, 'Loved Sintra');
    expect(api.holidays.getHoliday('hol_lisbon').reviewCount).toBe(before + 1);
    expect(api.holidays.tripToRate()).toBeNull();
    expect(() => api.holidays.rateTrip(t!.id, 4)).toThrow(/already rated/);
  });

  it('cannot rate or share a trip that has not happened yet', () => {
    as('noor@hayve.app');
    const h = api.holidays.getHoliday('hol_crete');
    const id = api.holidays.bookHoliday({ packageId: h.id, departure: h.departures[0], travellers: 1, method: 'card' });
    expect(() => api.holidays.rateTrip(id, 5)).toThrow(/once you are back/);
    expect(() => api.holidays.shareTrip(id)).toThrow(/once you are back/);
  });

  it('shares a short public link that never shows the hotel or the full name', () => {
    as('sam@hayve.app');
    const code = api.holidays.shareTrip('hb_seed_lisbon');
    expect(code).toMatch(/^LIS[A-Z2-9]{2}$/);
    expect(api.holidays.shareTrip('hb_seed_lisbon')).toBe(code);
    const mine = api.holidays.myTripMap('hb_seed_lisbon');
    expect(mine.stops.some((s) => s.kind === 'hotel')).toBe(true);
    api.session.signOut();
    const pub = api.holidays.publicTrip(code.toLowerCase());
    expect(pub.firstName).toBe('Sam');
    expect(JSON.stringify(pub)).not.toContain('Rivera');
    expect(pub.map.stops.some((s) => s.kind === 'hotel')).toBe(false);
    expect(JSON.stringify(pub)).not.toContain('Farol Bay');
    expect(pub.map.places).toBeGreaterThanOrEqual(3);
  });
});

describe('trip map maths', () => {
  const hotel: LngLat = [-9.4215, 38.6979];
  const line: LngLat[] = Array.from({ length: 40 }, (_, i) => [hotel[0] + i * 0.002, hotel[1]] as LngLat);
  it('measures distance', () => {
    expect(metersBetween([0, 0], [0, 1])).toBeGreaterThan(111000);
    expect(lineKm(line)).toBeGreaterThan(6);
  });
  it('leaves out the privacy zone around the hotel and splits the line there', () => {
    const through: LngLat[] = Array.from({ length: 41 }, (_, i) => [hotel[0] - 0.04 + i * 0.002, hotel[1]] as LngLat);
    const parts = trimPrivacy(through, [hotel], 400);
    expect(parts).toHaveLength(2);
    expect(parts.flat().every((p) => metersBetween(p, hotel) > 400)).toBe(true);
    expect(trimPrivacy(line, [], 400)).toEqual([line]);
  });
  it('fits the route inside the card', () => {
    const [pts] = fitToBox([line], 300, 500, 0.1);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(500);
    }
  });
});
