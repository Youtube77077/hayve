import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../src/backend/api';
import { accountIdFor, balancesFor, ledgerIsBalanced } from '../src/backend/ledger';
import { DEFAULT_FEE_TIERS, marketplaceFeeCents, OWNER_ADMIN_EMAILS, SIM_CODE } from '../src/backend/config';
import { createSeedDatabase, DEMO_PASSWORD } from '../src/backend/seed';
import { attachStorage, getDb } from '../src/backend/store';

const as = (email: string) => api.session.signIn(email, DEMO_PASSWORD);
const SAM = 'sam@hayve.app';
const NOOR = 'noor@hayve.app';
const LUCAS = 'lucas@hayve.app';

beforeEach(() => {
  attachStorage(null);
  createSeedDatabase();
  api.session.signOut();
});

/** Deep-search any value for a string (used to prove the purchaser never leaks). */
function contains(value: unknown, needle: string): boolean {
  return JSON.stringify(value ?? null).includes(needle);
}

describe('accounts', () => {
  it('signs up, signs in, edits profile and rejects bad credentials', () => {
    api.session.signUp({ email: 'new@hayve.app', password: 'supersecret', displayName: 'New Person', username: 'newperson' });
    expect(api.social.myProfile().profile.username).toBe('newperson');
    api.social.updateProfile({ bio: 'Hello', displayName: 'New P.' });
    expect(api.social.myProfile().profile.displayName).toBe('New P.');
    api.session.signOut();
    expect(() => api.session.signIn('new@hayve.app', 'wrong-pass')).toThrow(/incorrect/);
    api.session.signIn('new@hayve.app', 'supersecret');
    expect(() => api.session.signUp({ email: 'new@hayve.app', password: 'supersecret', displayName: 'X Y', username: 'other' })).toThrow(/already exists/);
  });
});

describe('Hayve Shop', () => {
  it('creates, edits, searches, favourites and deletes listings', () => {
    as(SAM);
    const id = api.shop.createListing({ title: 'Vintage desk lamp', description: 'Green glass bankers lamp', priceCents: 3500, category: 'home', condition: 'good', images: ['x'] });
    expect(api.shop.listProducts({ q: 'bankers lamp' }).map((p) => p.id)).toContain(id);
    api.shop.updateListing(id, { title: 'Vintage desk lamp', description: 'Green glass bankers lamp, works', priceCents: 3000, category: 'home', condition: 'good', images: ['x'] });
    expect(api.shop.getProduct(id).priceCents).toBe(3000);
    expect(api.shop.listProducts({ category: 'home', maxCents: 3000 }).every((p) => p.priceCents <= 3000)).toBe(true);
    api.session.signOut();
    as(NOOR);
    expect(api.shop.toggleFavourite(id)).toBe(true);
    expect(api.shop.myFavourites().map((p) => p.id)).toContain(id);
    expect(() => api.shop.deleteListing(id)).toThrow(/not your listing/);
    api.session.signOut();
    as(SAM);
    api.shop.deleteListing(id);
    expect(api.shop.listProducts({ q: 'bankers' })).toHaveLength(0);
  });

  it('completes a purchase with escrow released on confirmation', () => {
    as(SAM);
    const before = balancesFor(accountIdFor('u_ines')).pending;
    const { orderId } = api.shop.checkout('p_jacket', { addressId: 'ad_sam', method: 'wallet' });
    expect(api.shop.getProduct('p_jacket').available).toBe(false);
    expect(balancesFor(accountIdFor('u_ines')).pending).toBe(before + 12000);
    api.session.signOut();
    as('ines@hayve.app');
    api.shop.updateOrder(orderId, 'create_label');
    api.shop.updateOrder(orderId, 'ship');
    api.shop.updateOrder(orderId, 'deliver');
    api.session.signOut();
    as(SAM);
    api.shop.updateOrder(orderId, 'confirm');
    expect(api.shop.getOrder(orderId).status).toBe('completed');
    expect(balancesFor(accountIdFor('u_ines')).pending).toBe(before);
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('refunds a cancelled order and restores stock', () => {
    as(SAM);
    const start = api.wallet.wallet().available;
    const { orderId } = api.shop.checkout('p_lamp', { addressId: 'ad_sam', method: 'wallet' });
    expect(api.wallet.wallet().available).toBeLessThan(start);
    api.shop.updateOrder(orderId, 'cancel');
    expect(api.wallet.wallet().available).toBe(start);
    expect(api.shop.getProduct('p_lamp').available).toBe(true);
  });
});

describe('wishlists and anonymous gifting', () => {
  it('manages a wishlist: add, reorder, visibility', () => {
    as(SAM);
    api.wishlist.addToWishlist('p_sofa');
    const w = api.wishlist.myWishlist();
    expect(w.items.map((i) => i.productId)).toContain('p_sofa');
    const last = w.items[w.items.length - 1];
    api.wishlist.moveWishlistItem(last.id, -1);
    expect(api.wishlist.myWishlist().items[w.items.length - 2].id).toBe(last.id);
    api.wishlist.setWishlistVisibility('private');
    api.session.signOut();
    as(NOOR);
    expect(api.wishlist.getWishlistByUsername('samrivera').visible).toBe(false);
    expect(api.wishlist.getWishlistByUsername('samrivera').items).toHaveLength(0);
  });

  it('gifts anonymously: recipient only sees Sold and can never find the purchaser', () => {
    // Jonas has never interacted with Noor, so ANY trace of him in Noor's data is a leak.
    as('jonas@hayve.app');
    const view = api.wishlist.getWishlistByUsername('noor');
    const item = view.items.find((i) => i.productId === 'p_sunglasses')!;
    expect(item.canGift).toBe(true);
    const quote = api.wishlist.reserveGift(item.id);
    expect(contains(quote, 'Prinsengracht')).toBe(false); // purchaser never sees the address
    const receipt = api.wishlist.confirmGift(quote.reservationId, 'wallet');
    expect(receipt.reference).toMatch(/^HG-/);
    expect(api.wishlist.giftsSent().map((g) => g.orderId)).toContain(receipt.orderId);
    const purchaserOrder = api.shop.getOrder(receipt.orderId);
    expect(purchaserOrder.role).toBe('gift_purchaser');
    expect(purchaserOrder.shipTo).toBeNull();
    api.session.signOut();

    // Recipient perspective.
    as(NOOR);
    const mine = api.wishlist.myWishlist();
    expect(mine.items.find((i) => i.id === item.id)!.status).toBe('sold');
    const everythingNoorCanQuery = {
      wishlist: mine,
      purchases: api.shop.listPurchases(),
      sales: api.shop.listSales(),
      notifications: api.social.notifications(),
      threads: api.social.threads(),
      transactions: api.wallet.transactions(),
      requests: api.wallet.moneyRequests(),
      gifts: api.wishlist.giftsSent(),
    };
    for (const leak of ['u_jonas', 'Jonas', 'jonas@hayve.app']) {
      expect(contains(everythingNoorCanQuery, leak)).toBe(false);
    }
    expect(everythingNoorCanQuery.notifications.some((n) => /gift/i.test(n.title + n.body))).toBe(false);
    expect(() => api.shop.getOrder(receipt.orderId)).toThrow(/not found/);
    api.session.signOut();

    // Seller sees an anonymous Hayve Gift order with the address needed to ship it.
    as(LUCAS);
    const sale = api.shop.listSales().find((o) => o.id === receipt.orderId);
    expect(sale).toBeUndefined(); // sunglasses are Inès's listing
    api.session.signOut();
    as('ines@hayve.app');
    const inesSale = api.shop.getOrder(receipt.orderId);
    expect(inesSale.counterparty).toMatch(/anonymous/);
    expect(inesSale.shipTo?.line1).toBe('Prinsengracht 412-2');
    expect(contains(inesSale, 'Jonas')).toBe(false);
    expect(contains(api.wallet.transactions(), 'Jonas')).toBe(false);
    // The seller is paid from escrow: no transaction touching the seller references the purchaser's account.
    const sellerAcc = accountIdFor('u_ines');
    const jonasAcc = accountIdFor('u_jonas');
    const db = getDb();
    const sellerTxIds = new Set(db.entries.filter((e) => e.accountId === sellerAcc).map((e) => e.txId));
    for (const id of sellerTxIds) {
      expect(db.entries.filter((e) => e.txId === id).some((e) => e.accountId === jonasAcc)).toBe(false);
    }
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('prevents double gifting and concurrent reservations', () => {
    as(SAM);
    const item = api.wishlist.getWishlistByUsername('noor').items.find((i) => i.productId === 'p_film_camera')!;
    const q = api.wishlist.reserveGift(item.id);
    api.session.signOut();
    as('eva@hayve.app');
    const other = api.wishlist.getWishlistByUsername('noor').items.find((i) => i.id === item.id)!;
    expect(other.canGift).toBe(false);
    expect(other.status).toBe('reserved');
    expect(() => api.wishlist.reserveGift(item.id)).toThrow();
    // The single unit is also protected from a normal purchase while reserved.
    expect(() => api.shop.checkout('p_film_camera', { addressId: 'ad_eva', method: 'wallet' })).toThrow();
    api.session.signOut();
    // Noor (owner) must not see that a checkout is in progress.
    as(NOOR);
    expect(api.wishlist.myWishlist().items.find((i) => i.id === item.id)!.status).toBe('available');
    api.session.signOut();
    as(SAM);
    api.wishlist.confirmGift(q.reservationId, 'card');
    expect(() => api.wishlist.confirmGift(q.reservationId, 'card')).toThrow();
    api.session.signOut();
    as('eva@hayve.app');
    expect(() => api.wishlist.reserveGift(item.id)).toThrow(/Already sold/);
  });

  it('releases the reservation when payment fails', () => {
    as(SAM);
    const start = api.wallet.wallet();
    const item = api.wishlist.getWishlistByUsername('noor').items.find((i) => i.productId === 'p_mug')!;
    const q = api.wishlist.reserveGift(item.id);
    expect(() => api.wishlist.confirmGift(q.reservationId, 'card_declined')).toThrow(/declined/);
    expect(api.wishlist.getWishlistByUsername('noor').items.find((i) => i.id === item.id)!.status).toBe('available');
    expect(api.wallet.wallet()).toEqual(start);
    // Insufficient wallet funds also release cleanly.
    const q2 = api.wishlist.reserveGift(item.id);
    getDb().entries.push({ id: 'drain', txId: 'drain', accountId: accountIdFor('u_sam'), amountCents: -start.available, status: 'posted', createdAt: 0 });
    expect(() => api.wishlist.confirmGift(q2.reservationId, 'wallet')).toThrow(/Not enough/);
    expect(api.wishlist.getWishlistByUsername('noor').items.find((i) => i.id === item.id)!.canGift).toBe(true);
  });

  it('only allows gifting items that are on the recipient wishlist', () => {
    as(SAM);
    // There is no API to gift an arbitrary product: reserveGift takes a wishlist item id only.
    expect(() => api.wishlist.reserveGift('p_sofa')).toThrow(/not found/);
    // Private wishlists cannot be gifted from.
    expect(() => api.wishlist.reserveGift('w_jonas_1')).toThrow(/private/);
    // You can't gift yourself.
    const own = api.wishlist.myWishlist().items[0];
    expect(() => api.wishlist.reserveGift(own.id)).toThrow();
  });

  it('cancelling a gift refunds the purchaser and restores the wishlist item', () => {
    as(SAM);
    const start = api.wallet.wallet().available;
    const item = api.wishlist.getWishlistByUsername('noor').items.find((i) => i.productId === 'p_dress')!;
    const q = api.wishlist.reserveGift(item.id);
    const r = api.wishlist.confirmGift(q.reservationId, 'wallet');
    api.shop.updateOrder(r.orderId, 'cancel');
    expect(api.wallet.wallet().available).toBe(start);
    expect(api.wishlist.getWishlistByUsername('noor').items.find((i) => i.id === item.id)!.status).toBe('available');
  });

  it('lets a visitor buy a wishlist item for themselves', () => {
    as(SAM);
    const item = api.wishlist.getWishlistByUsername('noor').items.find((i) => i.productId === 'p_turntable')!;
    expect(item.canBuy).toBe(true);
    api.shop.checkout(item.productId, { addressId: 'ad_sam', method: 'wallet' });
    api.session.signOut();
    as(NOOR);
    expect(api.wishlist.myWishlist().items.find((i) => i.id === item.id)!.status).toBe('unavailable');
  });
});

describe('Hayve Pay', () => {
  it('sends, requests and keeps the ledger balanced', () => {
    as(SAM);
    const a = api.wallet.wallet().available;
    api.wallet.sendMoney('u_noor', 1500, 'Coffee');
    expect(api.wallet.wallet().available).toBe(a - 1500);
    expect(() => api.wallet.sendMoney('u_noor', 999_999_99)).toThrow();
    api.wallet.requestMoney('u_noor', 700, 'Tram');
    api.session.signOut();
    as(NOOR);
    const req = api.wallet.moneyRequests().find((r) => r.direction === 'incoming')!;
    api.wallet.respondToRequest(req.id, true);
    expect(api.wallet.transactions().some((t) => t.note === 'Coffee' && t.direction === 'in')).toBe(true);
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('adds and withdraws money', () => {
    as(SAM);
    const a = api.wallet.wallet().available;
    api.wallet.addMoney(5000, 'card');
    api.wallet.withdraw(2000);
    expect(api.wallet.wallet().available).toBe(a + 3000);
  });
});

describe('services', () => {
  it('orders food and completes it end to end', () => {
    as(SAM);
    const id = api.bites.placeFoodOrder({ restaurantId: 'rs_napoli', lines: [{ key: 'a', menuItemId: 'mi_1', qty: 2, options: ['Regular 30cm'] }], address: 'Cornelis Dirkszoonlaan 51', method: 'wallet' });
    for (let i = 0; i < 6; i++) api.bites.simulateFoodStep(id);
    expect(api.bites.getFoodOrder(id).status).toBe('delivered');
    expect(() => api.bites.placeFoodOrder({ restaurantId: 'rs_napoli', lines: [{ key: 'a', menuItemId: 'mi_1', qty: 1, options: [] }], address: 'x street 1', method: 'wallet' })).toThrow(/size/i);
  });

  it('kitchen accepts and rejects orders', () => {
    as(SAM);
    const id = api.bites.placeFoodOrder({ restaurantId: 'rs_green', lines: [{ key: 'a', menuItemId: 'mi_7', qty: 1, options: ['Tofu'] }], address: 'Cornelis Dirkszoonlaan 51', method: 'wallet' });
    const before = api.wallet.wallet().available;
    api.session.signOut();
    as('marco@hayve.app');
    api.bites.kitchenUpdate(id, 'rejected');
    api.session.signOut();
    as(SAM);
    expect(api.wallet.wallet().available).toBeGreaterThan(before); // hold released
  });

  it('books a ride, driver completes it and earns', () => {
    for (const d of getDb().drivers) d.online = d.userId === 'u_daan';
    as(SAM);
    const id = api.ride.requestRide('home', 'centraal', 'go', 'wallet');
    api.session.signOut();
    as('daan@hayve.app');
    expect(api.ride.driverQueue().map((r) => r.id)).toContain(id);
    const before = api.wallet.wallet().available;
    api.ride.driverAccept(id);
    api.ride.driverAdvance(id);
    api.ride.driverAdvance(id);
    api.ride.driverAdvance(id);
    const done = api.ride.getRide(id);
    expect(done.status).toBe('completed');
    // The driver keeps 85%; Hayve's commission is 15%.
    expect(done.split.hayveCents).toBe(Math.round(done.priceCents * 0.15));
    expect(api.wallet.wallet().available).toBe(before + done.priceCents - done.split.hayveCents);
  });

  it('offers a ride to the nearest suitable driver, then the next one on decline or timeout', () => {
    as(SAM);
    const id = api.ride.requestRide('home', 'centraal', 'xl', 'wallet');
    const r = getDb().rides.find((x) => x.id === id)!;
    // XL needs an XL vehicle: Kemal's Touran.
    expect(r.offer?.driverId).toBe('u_kemal');
    expect(api.ride.getRide(id).matching.current?.firstName).toBe('Kemal');
    as('kemal@hayve.app');
    expect(api.ride.driverQueue().map((x) => x.id)).toEqual([id]);
    api.ride.driverDecline(id);
    // Nobody else drives an XL, so it goes to the best other driver.
    expect(r.offer?.driverId).not.toBe('u_kemal');
    const second = r.offer!.driverId;
    as('daan@hayve.app');
    if (second !== 'u_daan') expect(() => api.ride.driverAccept(id)).toThrow(/another driver/);
    // Unanswered offers move on after the answer window.
    r.offer!.expiresAt = Date.now() - 1;
    api.ride.driverQueue();
    expect(r.offers!.map((o) => o.outcome).slice(0, 2)).toEqual(['declined', 'timeout']);
    expect(r.offer?.driverId).not.toBe(second);
    as(SAM);
    expect(api.ride.getRide(id).matching.declined).toBe(2);
  });

  it('ranks drivers by pickup time and shares the driver GPS position', () => {
    as(SAM);
    const id = api.ride.requestRide('home', 'centraal', 'go', 'wallet');
    const r = getDb().rides.find((x) => x.id === id)!;
    const ranked = api.ride.rankDrivers(r);
    expect(ranked.length).toBeGreaterThan(2);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].etaMin).toBeGreaterThanOrEqual(ranked[i - 1].etaMin);
    as('daan@hayve.app');
    api.ride.driverUpdateLocation(4.9, 52.37, 90);
    expect(getDb().drivers.find((d) => d.userId === 'u_daan')!.location).toMatchObject({ lng: 4.9, lat: 52.37 });
    expect(() => api.ride.driverUpdateLocation(400, 0)).toThrow(/Invalid/);
  });

  it('books a rental (host accepts) and prevents double booking', () => {
    as(SAM);
    const start = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
    const id = api.bookings.bookRental({ vehicleId: 'v_golf', start, end, pickupLocation: '', returnLocation: '', method: 'wallet', driverAge: 30 });
    api.session.signOut();
    as(NOOR);
    expect(() => api.bookings.bookRental({ vehicleId: 'v_golf', start, end, pickupLocation: '', returnLocation: '', method: 'wallet', driverAge: 30 })).toThrow(/not available/);
    api.session.signOut();
    as('mila@hayve.app');
    api.bookings.hostRespond('rental', id, 'accept');
    expect(api.bookings.getRental(id).status).toBe('confirmed');
  });

  it('books a stay with instant book and blocks those dates', () => {
    as(SAM);
    const checkIn = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const checkOut = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
    const id = api.bookings.bookStay({ propertyId: 'st_canal', checkIn, checkOut, guests: 2, method: 'card', message: 'Hi!' });
    expect(api.bookings.getStay(id).status).toBe('confirmed');
    expect(api.bookings.listProperties({ checkIn, checkOut }).map((p) => p.id)).not.toContain('st_canal');
    api.bookings.cancelStay(id);
    expect(api.bookings.listProperties({ checkIn, checkOut }).map((p) => p.id)).toContain('st_canal');
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('creates a courier delivery and tracks it', () => {
    as(SAM);
    const id = api.send.bookDelivery({ pickup: 'Cornelis Dirkszoonlaan 51', dropoff: 'Prinsengracht 412', recipientName: 'Noor', recipientPhone: '+31 6 1234 5678', size: 'M', weightKg: 3, instructions: '', speed: 'express', method: 'wallet' });
    api.session.signOut();
    as('yara@hayve.app');
    api.send.courierAccept(id);
    api.send.courierAdvance(id);
    api.send.courierAdvance(id);
    api.send.courierAdvance(id);
    expect(api.send.getDelivery(id).status).toBe('delivered');
    expect(api.business.earnings('courier').count).toBeGreaterThan(0);
  });
});

const STORE_INPUT = {
  legalName: 'Rivera Studio B.V.',
  tradingName: 'Rivera Studio',
  category: 'Design',
  registrationNumber: '12345678',
  vatNumber: 'NL123456789B01',
  address: { line1: 'Keizersgracht 1', city: 'Amsterdam', postcode: '1015 CJ', country: 'Netherlands' },
  ownerIdChecked: true,
};

function makeOwnerAdmin() {
  api.session.signUp({ email: OWNER_ADMIN_EMAILS[0], password: 'correct-horse', displayName: 'Hayve Owner', username: 'owner' });
  api.session.verifyEmail(SIM_CODE);
  api.session.enableTwoFactor(SIM_CODE);
}

describe('marketplace fees', () => {
  it('uses tiered fees that never go down when the price goes up', () => {
    const fee = (eur: number) => marketplaceFeeCents(Math.round(eur * 100), DEFAULT_FEE_TIERS);
    expect(fee(20)).toBe(100); // 5%
    expect(fee(50)).toBe(250);
    expect(fee(50.01)).toBe(250); // 4% would be €2.00 → floor of tier below
    expect(fee(100)).toBe(400);
    expect(fee(250)).toBe(1000);
    expect(fee(260)).toBe(1000); // not €7.80
    expect(fee(1000)).toBe(3000);
    expect(fee(1200)).toBe(3000); // 2% = €24 → €30
    expect(fee(2000)).toBe(4000);
    for (let c = 100; c < 300000; c += 137) expect(marketplaceFeeCents(c + 137, DEFAULT_FEE_TIERS)).toBeGreaterThanOrEqual(marketplaceFeeCents(c, DEFAULT_FEE_TIERS));
  });

  it('charges the tier fee at checkout and adds Hayve Send shipping only when shipping', () => {
    as(SAM);
    const ship = api.shop.quote('p_jacket', 'ship');
    expect(ship.feeCents).toBe(480); // €120 × 4%
    expect(ship.shippingCents).toBe(395);
    const pickup = api.shop.quote('p_jacket', 'pickup');
    expect(pickup.shippingCents).toBe(0);
    expect(pickup.totalCents).toBe(12000 + 480);
  });
});

describe('Wave Back', () => {
  it('pays 1% (max €5) on Shop purchases with balance, nothing on card payments', () => {
    as(SAM);
    const card = api.shop.checkout('p_lamp', { addressId: 'ad_sam', method: 'card' });
    expect(card.waveBackCents).toBe(0);
    const bal = api.shop.checkout('p_jacket', { addressId: 'ad_sam', method: 'wallet' });
    expect(bal.waveBackCents).toBe(120); // 1% of €120
    const big = api.shop.quote('p_laptop');
    void big;
    expect(api.wallet.transactions().some((t) => t.type === 'wave_back' && t.amountCents === 120)).toBe(true);
  });

  it('caps Shop Wave Back at €5 per purchase and pays 2% on services', () => {
    as(NOOR);
    api.wallet.connectBank({ connection: 'ideal_wero', bank: 'ING' });
    api.wallet.addMoney(80000, 'bank');
    const r = api.shop.checkout('p_laptop', { addressId: 'ad_noor', method: 'wallet' });
    expect(r.waveBackCents).toBe(500); // 1% of €640 = €6.40 → capped
    const ride = api.ride.requestRide('home', 'centraal', 'go', 'wallet');
    for (let i = 0; i < 8 && api.ride.getRide(ride).status !== 'completed'; i++) api.ride.simulateRideStep(ride);
    const fare = api.ride.getRide(ride).priceCents;
    const wb = api.wallet.transactions().find((t) => t.type === 'wave_back' && t.ref?.id && t.amountCents === Math.round(fare * 0.02));
    expect(wb).toBeTruthy();
  });

  it('gives new members 5% for 30 days up to €10, within the €20 monthly cap', () => {
    api.session.signUp({ email: 'fresh@hayve.app', password: 'password1', displayName: 'Fresh Member', username: 'fresh' });
    api.wallet.connectBank({ connection: 'ideal_wero', bank: 'ING' });
    api.wallet.addMoney(100000, 'bank');
    api.social.saveAddress({ label: 'Home', fullName: 'Fresh Member', line1: 'Damrak 1', city: 'Amsterdam', postcode: '1012 LG', country: 'Netherlands' });
    const addr = api.social.addresses()[0].id;
    const first = api.shop.checkout('p_jacket', { addressId: addr, method: 'wallet' }); // 5% of €120 = €6.00 → shop cap €5
    expect(first.waveBackCents).toBe(500);
    const second = api.shop.checkout('p_chair', { addressId: addr, method: 'wallet' }); // 5% of €180 = €9 → €5 cap
    expect(second.waveBackCents).toBe(500);
    const third = api.shop.checkout('p_smartwatch', { addressId: addr, method: 'wallet' }); // welcome budget used → 1% = €1.60
    expect(third.waveBackCents).toBe(160);
    const total = api.wallet.transactions().filter((t) => t.type === 'wave_back').reduce((a, t) => a + t.amountCents, 0);
    expect(total).toBeLessThanOrEqual(2000);
  });

  it('never pays Wave Back on top-ups or transfers, and reverses it on refunds', () => {
    as(SAM);
    api.wallet.addMoney(5000);
    api.wallet.sendMoney('u_noor', 1000);
    expect(api.wallet.transactions().filter((t) => t.type === 'wave_back')).toHaveLength(0);
    const r = api.shop.checkout('p_jacket', { addressId: 'ad_sam', method: 'wallet' });
    const before = api.wallet.wallet().available;
    api.shop.updateOrder(r.orderId, 'cancel');
    expect(api.wallet.wallet().available).toBe(before + 12000 + 480 + 395 - 120);
    expect(ledgerIsBalanced()).toBe(true);
  });
});

describe('Hayve Send inside the order flow', () => {
  it('creates a label, ships, tracks and delivers', () => {
    as(SAM);
    const { orderId } = api.shop.checkout('p_jacket', { addressId: 'ad_sam', method: 'wallet', delivery: 'ship' });
    api.session.signOut();
    as('ines@hayve.app');
    expect(api.shop.getOrder(orderId).actions).toContain('create_label');
    api.shop.updateOrder(orderId, 'create_label');
    const code = api.shop.getOrder(orderId).shipment!.trackingCode;
    expect(code).toMatch(/^HX-/);
    api.shop.updateOrder(orderId, 'ship');
    expect(api.shop.trackShipment(code).events.map((e) => e.status)).toEqual(['label_created', 'in_transit']);
    api.shop.updateOrder(orderId, 'deliver');
    expect(api.shop.trackShipment(code).delivered).toBe(true);
    api.session.signOut();
    as(SAM);
    api.shop.updateOrder(orderId, 'confirm');
    api.shop.reviewOrder(orderId, 5, 'Perfect jacket');
    expect(() => api.shop.reviewOrder(orderId, 4)).toThrow(/already/);
  });

  it('supports pickup in person without shipping', () => {
    as(SAM);
    const { orderId } = api.shop.checkout('p_lamp', { method: 'wallet', delivery: 'pickup' });
    api.session.signOut();
    as('eva@hayve.app');
    expect(api.shop.getOrder(orderId).actions).toContain('handover');
    api.shop.updateOrder(orderId, 'handover');
    expect(api.shop.getOrder(orderId).status).toBe('delivered');
  });
});

describe('wishlist visibility', () => {
  it('supports public, link-only and private wishlists', () => {
    as(NOOR);
    api.wishlist.setWishlistVisibility('link');
    const token = api.wishlist.myWishlist().shareToken!;
    api.session.signOut();
    as(SAM);
    expect(api.wishlist.getWishlistByUsername('noor').visible).toBe(false);
    expect(api.wishlist.getWishlistByUsername('noor', 'wrong').visible).toBe(false);
    const viaLink = api.wishlist.getWishlistByUsername('noor', token);
    expect(viaLink.visible).toBe(true);
    expect(() => api.wishlist.reserveGift(viaLink.items[0].id)).toThrow(/private/);
    const q = api.wishlist.reserveGift(viaLink.items[0].id, token);
    api.wishlist.releaseGift(q.reservationId);
    api.session.signOut();
    as(NOOR);
    api.wishlist.resetWishlistLink();
    api.wishlist.setWishlistVisibility('private');
    api.session.signOut();
    as(SAM);
    expect(api.wishlist.getWishlistByUsername('noor', token).visible).toBe(false);
  });
});

describe('Hayve Store and admin', () => {
  it('requires admin review: pending → verified, with a verified label on listings', () => {
    as(SAM);
    expect(() => api.business.registerBusiness({ ...STORE_INPUT, ownerIdChecked: false })).toThrow(/ID/);
    expect(() => api.business.registerBusiness({ ...STORE_INPUT, registrationNumber: '123' })).toThrow(/KVK/);
    api.business.registerBusiness(STORE_INPUT);
    expect(api.business.myBusiness()!.status).toBe('pending');
    expect(api.shop.getProduct('p_laptop').fromVerifiedBusiness).toBe(false);
    expect(() => api.business.createPaymentLink('Deposit', 2500)).toThrow();
    const biz = api.business.myBusiness()!.id;
    api.session.signOut();
    makeOwnerAdmin();
    expect(() => api.admin.reviewBusiness(biz, 'reject', '')).toThrow(/reason/);
    api.admin.reviewBusiness(biz, 'approve');
    api.session.signOut();
    as(SAM);
    expect(api.business.myBusiness()!.status).toBe('verified');
    expect(api.shop.getProduct('p_laptop').fromVerifiedBusiness).toBe(true);
    const link = api.business.createPaymentLink('Logo design deposit', 25000);
    api.session.signOut();
    as(NOOR);
    api.business.payCheckout(link, 'card');
    api.session.signOut();
    as(SAM);
    expect(api.business.merchantPayments()).toHaveLength(1);
  });

  it('lets a rejected business see the reason and resubmit', () => {
    as(SAM);
    api.business.registerBusiness(STORE_INPUT);
    const biz = api.business.myBusiness()!.id;
    api.session.signOut();
    makeOwnerAdmin();
    api.admin.reviewBusiness(biz, 'reject', 'VAT number does not match the KVK record');
    api.session.signOut();
    as(SAM);
    expect(api.business.myBusiness()!.rejectionReason).toMatch(/VAT/);
    api.business.registerBusiness({ ...STORE_INPUT, vatNumber: 'NL999999999B01' });
    expect(api.business.myBusiness()!.status).toBe('pending');
  });

  it('issues VAT invoices for verified Store orders', () => {
    as(SAM);
    const { orderId } = api.shop.checkout('p_turntable', { addressId: 'ad_sam', method: 'wallet' });
    const inv = api.shop.invoice(orderId);
    expect(inv.seller.vat).toMatch(/^NL/);
    expect(inv.netCents + inv.vatCents).toBe(inv.grossCents);
    expect(inv.grossCents).toBe(18900 + 395);
  });

  it('only gives admin to the owner email, and requires email verification + 2FA', () => {
    as(SAM);
    expect(() => api.admin.overview()).toThrow(/access/);
    api.session.signOut();
    api.session.signUp({ email: OWNER_ADMIN_EMAILS[0], password: 'correct-horse', displayName: 'Hayve Owner', username: 'owner' });
    expect(() => api.admin.overview()).toThrow(/two-step/);
    api.session.verifyEmail(SIM_CODE);
    expect(() => api.admin.overview()).toThrow(/two-step/);
    api.session.enableTwoFactor(SIM_CODE);
    expect(api.admin.overview().ledgerBalanced).toBe(true);
    expect(api.admin.overview().pendingVerifications).toBe(1); // Casa Eva in the seed
  });

  it('suspends users, handles reports, edits settings and logs every action', () => {
    as(SAM);
    api.social.report('listing', 'p_sofa', 'Looks like a scam');
    api.session.signOut();
    makeOwnerAdmin();
    const rep = api.admin.reports()[0];
    api.admin.resolveReport(rep.id, 'remove_content');
    expect(api.shop.listProducts({ q: 'velvet sofa' })).toHaveLength(0);
    api.admin.suspendUser('u_jonas', 'Spam');
    api.admin.updateFeeTiers([{ upToCents: 10000, rate: 0.06 }, { upToCents: null, rate: 0.03 }]);
    expect(api.shop.quote('p_lamp').feeCents).toBe(270); // 6% of €45
    api.admin.updateWaveBack({ shopRate: 0.02 });
    api.admin.removeBio('u_noor');
    const actions = api.admin.auditLog().map((a) => a.action);
    for (const a of ['moderation.listing_remove', 'report.resolved', 'user.suspend', 'settings.fee_tiers', 'settings.wave_back', 'moderation.remove_bio']) expect(actions).toContain(a);
    api.session.signOut();
    expect(() => api.session.signIn('jonas@hayve.app', DEMO_PASSWORD)).toThrow(/suspended/);
  });

  it('exports personal data without secrets', () => {
    as(SAM);
    const data = api.social.exportMyData();
    expect(data.account.email).toBe('sam@hayve.app');
    expect(JSON.stringify(data)).not.toContain('sim$');
    expect(data.listings.length).toBeGreaterThan(0);
  });
});

describe('Tap to Pay', () => {
  const wb = (email: string) => {
    as(email);
    return api.wallet.waveBackSummary().totalCents;
  };

  it('requires an identity check and enforces amounts and the private monthly limit', () => {
    as(SAM);
    expect(() => api.tap.createCharge(2400)).toThrow(/Verify your identity/);
    api.tap.verifyIdentity();
    expect(() => api.tap.createCharge(10)).toThrow(/at least/);
    expect(() => api.tap.createCharge(60_000)).toThrow(/most you can take/);
    getDb().settings!.tapToPay = { ...getDb().settings!.tapToPay!, privateMonthlyLimitCents: 3000 };
    expect(() => api.tap.createCharge(4000)).toThrow(/monthly limit/);
  });

  it('takes a card tap: receiver gets amount minus Fees as pending, then available; payer pays nothing extra', () => {
    as(SAM);
    api.tap.verifyIdentity();
    const acc = accountIdFor('u_sam');
    const before = balancesFor(acc);
    const id = api.tap.createCharge(2400, 'Concert tickets');
    const v = api.tap.simulateTap(id, { method: 'card', brand: 'Visa', last4: '4417' });
    expect(v.feeCents).toBe(60); // 2.5%
    expect(v.netCents).toBe(2340);
    expect(v.status).toBe('pending');
    expect(balancesFor(acc).pending - before.pending).toBe(2340);
    expect(v.waveBackClaimable).toBe(true); // payer unknown: QR claim offered
    // Settlement
    getDb().tapPayments.find((t) => t.id === id)!.settleAt = Date.now() - 1;
    expect(api.tap.getTap(id).status).toBe('available');
    expect(balancesFor(acc).available - before.available).toBe(2340);
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('never marks a payment paid without provider confirmation (offline, declined)', () => {
    as(SAM);
    api.tap.verifyIdentity();
    const id = api.tap.createCharge(1000);
    expect(() => api.tap.simulateTap(id, { method: 'card', offline: true })).toThrow(/No connection/);
    expect(api.tap.getTap(id).status).toBe('awaiting_tap');
    expect(() => api.tap.simulateTap(id, { method: 'card', decline: true })).toThrow(/declined/);
    expect(api.tap.getTap(id).status).toBe('failed');
    expect(api.tap.history().find((t) => t.id === id)?.txId).toBeUndefined();
  });

  it('pays 1% Wave Back when the payer uses their Hayve balance, 0.5% for a saved card, none for self', () => {
    const noorBefore = wb(NOOR);
    as(SAM);
    api.tap.verifyIdentity();
    let id = api.tap.createCharge(2000);
    api.tap.simulateTap(id, { method: 'hayve_balance', payerUsername: 'noor' });
    expect(wb(NOOR) - noorBefore).toBe(20);
    const noorMid = wb(NOOR);
    as(SAM);
    id = api.tap.createCharge(2000);
    api.tap.simulateTap(id, { method: 'card', brand: 'Mastercard', last4: '5100', payerUsername: 'noor' }); // Noor's saved card
    expect(wb(NOOR) - noorMid).toBe(10);
    as(SAM);
    id = api.tap.createCharge(2000);
    expect(() => api.tap.simulateTap(id, { method: 'hayve_balance', payerUsername: 'samrivera' })).toThrow(/pay yourself/);
  });

  it('lets the payer claim Wave Back once with the receipt QR within 24 hours', () => {
    as(SAM);
    api.tap.verifyIdentity();
    const id = api.tap.createCharge(3000);
    api.tap.simulateTap(id, { method: 'apple_pay', last4: '9999' });
    const token = api.tap.getTap(id).receiptToken;
    expect(() => api.tap.claimWaveBack(token)).toThrow(/yourself/);
    const before = wb(NOOR);
    expect(api.tap.receipt(token).claimable).toBe(true);
    expect(api.tap.claimWaveBack(token)).toBe(15);
    expect(wb(NOOR) - before).toBe(15);
    expect(() => api.tap.claimWaveBack(token)).toThrow(/already been claimed/);
  });

  it('refunds within 30 days, reverses the payer Wave Back, and blocks later refunds', () => {
    as(SAM);
    api.tap.verifyIdentity();
    const id = api.tap.createCharge(2000);
    api.tap.simulateTap(id, { method: 'hayve_balance', payerUsername: 'noor' });
    const noorAfterPay = wb(NOOR);
    as(SAM);
    api.tap.refund(id);
    expect(api.tap.getTap(id).status).toBe('refunded');
    expect(wb(NOOR)).toBe(noorAfterPay - 20);
    as(SAM);
    const id2 = api.tap.createCharge(1500);
    api.tap.simulateTap(id2, { method: 'card' });
    getDb().tapPayments.find((t) => t.id === id2)!.paidAt = Date.now() - 31 * 86_400_000;
    expect(() => api.tap.refund(id2)).toThrow(/within 30 days/);
    expect(ledgerIsBalanced()).toBe(true);
  });
});

describe('Hayve Card', () => {
  it('issues after identity check, applies controls and limits, and pays Wave Back by merchant type', () => {
    as(SAM);
    expect(() => api.card.issue()).toThrow(/Verify your identity/);
    api.tap.verifyIdentity();
    api.card.issue();
    const before = api.wallet.waveBackSummary().totalCents;
    const r1 = api.card.simulatePurchase({ merchantId: 'ah', amountCents: 1240, channel: 'contactless' });
    expect(r1.waveBackCents).toBe(1); // 0.1%
    const r2 = api.card.simulatePurchase({ merchantId: 'napoli', amountCents: 2000, channel: 'chip' });
    expect(r2.waveBackCents).toBe(20); // partner 1%
    expect(api.wallet.waveBackSummary().totalCents - before).toBe(21);
    expect(() => api.card.simulatePurchase({ merchantId: 'casino', amountCents: 1000, channel: 'chip' })).toThrow(/Gambling/);
    api.card.setBlocks({ online: true });
    expect(() => api.card.simulatePurchase({ merchantId: 'bol', amountCents: 1000, channel: 'online' })).toThrow(/Online payments are blocked/);
    api.card.setFrozen(true);
    expect(() => api.card.simulatePurchase({ merchantId: 'ah', amountCents: 100, channel: 'contactless' })).toThrow(/frozen/);
    api.card.setFrozen(false);
    api.card.setLimits({ dailyCents: 5000, monthlyCents: 10000 });
    expect(() => api.card.simulatePurchase({ merchantId: 'ah', amountCents: 2000, channel: 'chip' })).toThrow(/daily/);
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('tops up from the linked bank in batches when the balance is too low', () => {
    as(SAM);
    api.tap.verifyIdentity();
    api.card.issue();
    const acc = accountIdFor('u_sam');
    const bal = balancesFor(acc).available;
    api.card.setLimits({ dailyCents: 1_000_000, monthlyCents: 2_000_000 });
    getDb().linkedBanks = [];
    expect(() => api.card.simulatePurchase({ merchantId: 'bol', amountCents: bal + 100, channel: 'chip' })).toThrow(/auto top-up/);
    api.card.linkBank({ holder: 'Sam Rivera', iban: 'NL91 ABNA 0417 1643 00', method: 'sepa_debit' });
    api.card.setAutoTopUp({ enabled: true, amountCents: 5000 });
    const r = api.card.simulatePurchase({ merchantId: 'bol', amountCents: bal + 7000, channel: 'chip' });
    expect(r.toppedUpCents).toBe(10000); // two batches of €50
    expect(balancesFor(acc).available).toBe(bal + 10000 - (bal + 7000) + r.waveBackCents);
  });

  it('applies admin Wave Back boosts and keeps the monthly maximum', () => {
    as(SAM);
    api.tap.verifyIdentity();
    api.card.issue();
    api.card.setLimits({ dailyCents: 1_000_000, monthlyCents: 2_000_000 });
    getDb().waveBackBoosts.push({ id: 'b1', merchant: 'Albert Heijn', rate: 0.05, startsAt: Date.now() - 1000, endsAt: Date.now() + 86_400_000, createdBy: 'u_admin', createdAt: Date.now() });
    const r = api.card.simulatePurchase({ merchantId: 'ah', amountCents: 2000, channel: 'chip' });
    expect(r.waveBackCents).toBe(100); // 5% boost
    api.card.linkBank({ holder: 'Sam Rivera', iban: 'NL91ABNA0417164300', method: 'ideal_wero' });
    const big = api.card.simulatePurchase({ merchantId: 'ah', amountCents: 100_000, channel: 'chip' });
    const month = api.wallet.waveBackSummary().thisMonthCents;
    expect(month).toBeLessThanOrEqual(2000);
    expect(big.waveBackCents).toBeLessThan(5000);
  });

  it('reveals details only after re-authentication and validates PIN and IBAN', () => {
    as(SAM);
    api.tap.verifyIdentity();
    api.card.issue();
    expect(() => api.card.revealDetails({ password: 'nope' })).toThrow(/incorrect/);
    const d = api.card.revealDetails({ password: DEMO_PASSWORD });
    expect(d.number.replace(/\s/g, '')).toHaveLength(16);
    expect(d.number.endsWith(api.card.get().card!.last4)).toBe(true);
    expect(() => api.card.changePin('1234')).toThrow(/harder to guess/);
    api.card.changePin('8302');
    expect(() => api.card.linkBank({ holder: 'Sam', iban: '123', method: 'sepa_debit' })).toThrow(/valid IBAN/);
  });
});

describe('payment requests and links', () => {
  const samAcc = () => balancesFor(accountIdFor('u_sam')).available;

  it('creates a link anyone can pay without an account, by bank or card, single-use', () => {
    as(SAM);
    const id = api.requests.create({ kind: 'personal', title: 'Dinner', amountCents: 2500 });
    const before = samAcc();
    api.session.signOut();
    const pub = api.requests.publicView(id);
    expect(pub.amountCents).toBe(2500);
    expect(pub.requester.firstName).toBe('Sam');
    expect(contains(pub, 'payments')).toBe(false);
    expect(() => api.requests.pay(id, { method: 'bank', bank: 'ING' })).toThrow(/your name/);
    expect(() => api.requests.pay(id, { method: 'hayve', payerName: 'Guest' })).toThrow(/Sign in/);
    const res = api.requests.pay(id, { method: 'bank', bank: 'ING', payerName: 'Max' });
    expect(res.signedIn).toBe(false);
    expect(api.requests.publicView(id).status).toBe('paid');
    expect(() => api.requests.pay(id, { method: 'card', payerName: 'Max', card: { brand: 'Visa', last4: '4242' } })).toThrow(/already been paid/);
    as(SAM);
    expect(samAcc()).toBe(before + 2500); // personal requests are free
    const v = api.requests.get(id);
    expect(v.payments[0].payerId).toBeNull();
    expect(v.payments[0].methodLabel).toContain('ING');
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('splits a bill, tracks who paid and closes when everyone has paid', () => {
    as(SAM);
    const id = api.requests.create({ kind: 'split', title: 'Dinner', splitTotalCents: 10000, people: 4, names: ['Noor', 'Eva'] });
    const v = api.requests.get(id);
    expect(v.amountCents).toBe(2500);
    expect(v.expectedCount).toBe(3);
    expect(v.split!.shares.map((s) => s.name)).toEqual(['Sam Rivera', 'Noor', 'Eva', 'Person 4']);
    as(NOOR);
    expect(() => api.requests.pay(id, { method: 'hayve' })).toThrow(/who you are/);
    api.requests.pay(id, { method: 'hayve', shareId: 's1' });
    expect(() => api.requests.pay(id, { method: 'hayve', shareId: 's1' })).toThrow(/already paid/);
    api.session.signOut();
    api.requests.pay(id, { method: 'card', shareId: 's2', card: { brand: 'Mastercard', last4: '5100' } });
    as(SAM);
    expect(api.requests.get(id).status).toBe('pending');
    api.requests.markSharePaid(id, 's3');
    const done = api.requests.get(id);
    expect(done.status).toBe('paid');
    expect(done.collectedCents).toBe(5000);
    expect(api.requests.mine('paid').items.map((r) => r.id)).toContain(id);
  });

  it('charges business requests a small fee (never the payer) and needs a verified business', () => {
    as(SAM);
    expect(() => api.requests.create({ kind: 'business', title: 'Repair', amountCents: 10000, invoiceNumber: 'INV-1' })).toThrow(/verified/);
    as(LUCAS);
    const id = api.requests.create({ kind: 'business', title: 'Turntable service', amountCents: 10000, invoiceNumber: 'INV-2026-014', reusable: true });
    const pub = api.requests.publicView(id);
    expect(pub.business?.invoiceNumber).toBe('INV-2026-014');
    expect(pub.amountCents).toBe(10000);
    as(NOOR);
    api.wallet.connectBank({ connection: 'ideal_wero', bank: 'ING' });
    api.wallet.addMoney(50000, 'bank');
    const noorBefore = balancesFor(accountIdFor('u_noor')).available;
    api.requests.pay(id, { method: 'hayve' });
    api.requests.pay(id, { method: 'hayve' }); // reusable
    expect(balancesFor(accountIdFor('u_noor')).available).toBe(noorBefore - 20000);
    as(LUCAS);
    const v = api.requests.get(id);
    expect(v.status).toBe('pending');
    expect(v.feesCents).toBe(2 * (120 + 20));
    expect(v.collectedCents).toBe(20000 - v.feesCents);
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('expires, cancels and refuses paying your own request', () => {
    as(SAM);
    const id = api.requests.create({ kind: 'personal', title: 'Tickets', amountCents: 1800, expiresInDays: 1 });
    expect(() => api.requests.pay(id, { method: 'hayve' })).toThrow(/own request/);
    getDb().payRequests.find((r) => r.id === id)!.expiresAt = Date.now() - 1;
    expect(api.requests.get(id).status).toBe('expired');
    as(NOOR);
    expect(() => api.requests.pay(id, { method: 'hayve' })).toThrow(/expired/);
    as(SAM);
    const id2 = api.requests.create({ kind: 'personal', title: 'Taxi', amountCents: 1200 });
    api.requests.cancel(id2);
    expect(api.requests.mine().counts.cancelled).toBe(1);
    expect(() => api.requests.create({ kind: 'personal', title: 'x', amountCents: 1200 })).toThrow(/description/);
    expect(() => api.requests.create({ kind: 'split', title: 'Pizza', splitTotalCents: 150, people: 2 })).toThrow(/at least/);
  });

  it('holds deposits for a booking and lets the host release or claim them', () => {
    const prop = getDb().properties.find((p) => p.hostId === 'u_mila')!;
    getDb().stayBookings.push({ id: 'sb_test', reference: 'HS-TEST', propertyId: prop.id, guestId: 'u_noor', hostId: 'u_mila', checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3, guests: 2, totalCents: 45000, status: 'confirmed', createdAt: Date.now() });
    as('mila@hayve.app');
    const stay = api.requests.linkables().find((l) => l.kind === 'stay')!;
    expect(stay.depositAllowed).toBe(true);
    expect(() => api.requests.create({ kind: 'deposit', title: 'Deposit', amountCents: 20000 })).toThrow(/stay or rental/);
    const id = api.requests.create({ kind: 'deposit', title: 'Deposit', amountCents: 20000, ref: { kind: 'stay', id: stay.id } });
    as(NOOR);
    api.wallet.connectBank({ connection: 'ideal_wero', bank: 'ING' });
    api.wallet.addMoney(30000, 'bank');
    const before = balancesFor(accountIdFor('u_noor'));
    api.requests.pay(id, { method: 'hayve' });
    expect(balancesFor(accountIdFor('u_noor')).available).toBe(before.available - 20000);
    as('mila@hayve.app');
    const p = api.requests.get(id).payments[0];
    expect(p.status).toBe('held');
    api.requests.releaseDeposit(id, p.id);
    expect(balancesFor(accountIdFor('u_noor')).available).toBe(before.available);
    expect(ledgerIsBalanced()).toBe(true);
  });

  it('only links your own orders and bookings', () => {
    as(SAM);
    expect(() => api.requests.create({ kind: 'personal', title: 'Order', amountCents: 1000, ref: { kind: 'stay', id: 'nope' } })).toThrow(/your own/);
  });
});

describe('cards and banks', () => {
  it('connects a bank with iDEAL | Wero, adds cards without ever seeing the number, and pays with them', () => {
    as(NOOR);
    expect(() => api.wallet.addMoney(1000, 'bank')).toThrow(/Connect a bank/);
    api.wallet.connectBank({ connection: 'ideal_wero', bank: 'ING' });
    const bank = api.wallet.paymentMethods().find((m) => m.kind === 'bank')!;
    expect(bank.label).toMatch(/^ING •••• \d{4}$/);
    expect(getDb().linkedBanks.find((b) => b.userId === 'u_noor')?.bank).toBe('ING');
    api.wallet.addMoney(1000, 'bank');
    expect(() => api.wallet.addCard({ brand: 'Visa', last4: '1111', expiry: '01/20', funding: 'debit' })).toThrow(/expired/);
    api.wallet.addCard({ brand: 'Visa', last4: '1111', expiry: '12/30', funding: 'credit' });
    expect(() => api.wallet.addCard({ brand: 'Visa', last4: '1111', expiry: '12/30', funding: 'credit' })).toThrow(/already saved/);
    expect(contains(getDb().paymentMethods, '4111111111111111')).toBe(false);
    const id = api.wallet.paymentMethods().find((m) => m.last4 === '1111')!.id;
    api.wallet.setDefaultCard(id);
    expect(api.wallet.paymentMethods().find((m) => m.id === id)!.isDefault).toBe(true);
    api.wallet.deletePaymentMethod(bank.id);
    expect(getDb().linkedBanks.some((b) => b.userId === 'u_noor')).toBe(false);
  });
});
