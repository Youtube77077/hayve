import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../src/backend/api';
import { accountIdFor, balancesFor, ledgerIsBalanced } from '../src/backend/ledger';
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
    api.wishlist.setWishlistVisibility(false);
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
    expect(api.wallet.wallet().available).toBeGreaterThan(before);
    expect(api.ride.getRide(id).status).toBe('completed');
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

describe('business and admin', () => {
  it('registers a business, verifies it and accepts a Hayve Pay checkout', () => {
    as(SAM);
    api.business.registerBusiness({ legalName: 'Rivera Studio B.V.', tradingName: 'Rivera Studio', category: 'Design', country: 'Netherlands', registrationNumber: '12345678' });
    api.business.completeVerificationStep('identity');
    api.business.completeVerificationStep('bank');
    expect(api.business.myBusiness()!.verification.status).toBe('verified');
    const link = api.business.createPaymentLink('Logo design deposit', 25000);
    api.session.signOut();
    as(NOOR);
    api.business.payCheckout(link, 'card');
    api.session.signOut();
    as(SAM);
    expect(api.business.merchantPayments()).toHaveLength(1);
    expect(api.business.earnings('merchant').totalCents).toBeGreaterThan(24000);
  });

  it('blocks non-admins from the admin console', () => {
    as(SAM);
    expect(() => api.admin.overview()).toThrow(/access/);
    api.session.signOut();
    as('admin@hayve.app');
    expect(api.admin.overview().ledgerBalanced).toBe(true);
  });
});
