import { accountIdFor, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, reference, uid } from '../store';
import type { GiftReservation, ID, Order, WishlistItem } from '../types';
import {
  abortPayment,
  audit,
  beginPayment,
  completePayment,
  displayName,
  notify,
  type PayMethod,
  profileOf,
  protectionFee,
  publicUser,
  type PublicUser,
  SHIPPING_CENTS,
} from './common';
import { getSessionUserId, me } from './session';
import { type ProductCard, toCard } from './shop';

/**
 * Wishlists and anonymous gifting.
 *
 * Privacy model (mirrored by RLS in supabase/migrations/0003_gifting.sql):
 *  - The purchaser of a gift is stored ONLY in `giftOrders` / `giftReservations`.
 *  - `orders.buyerId` is null for gifts, so no order query can leak the purchaser.
 *  - The recipient's wishlist view collapses `reserved` into `available` and
 *    `sold` is the only signal they ever get. No notification is sent to them.
 *  - The purchaser never receives the recipient's address.
 */

export const RESERVATION_MS = 10 * 60 * 1000;

export type WishlistItemStatus = 'available' | 'reserved' | 'sold' | 'unavailable';

export interface WishlistItemView {
  id: ID;
  position: number;
  status: WishlistItemStatus;
  product: ProductCard | null;
  productId: ID;
  title: string;
  image?: string;
  priceCents: number;
  canBuy: boolean;
  canGift: boolean;
  giftBlockedReason?: string;
  addedAt: number;
}

export interface WishlistView {
  owner: PublicUser;
  isOwner: boolean;
  isPublic: boolean;
  visible: boolean;
  items: WishlistItemView[];
}

/** Lazily expires abandoned gift checkouts so items become available again. */
export function sweepReservations() {
  const db = getDb();
  const t = now();
  let changed = false;
  for (const r of [...db.giftReservations]) {
    if (r.expiresAt > t) continue;
    const item = db.wishlistItems.find((w) => w.id === r.wishlistItemId);
    if (item && item.status === 'reserved' && item.reservation?.id === r.id) {
      item.status = 'available';
      item.reservation = undefined;
    }
    db.giftReservations = db.giftReservations.filter((x) => x.id !== r.id);
    changed = true;
  }
  if (changed) commit();
}

function itemView(item: WishlistItem, viewerId: ID | null): WishlistItemView {
  const db = getDb();
  const product = db.products.find((p) => p.id === item.productId);
  const isOwner = viewerId === item.ownerId;
  const productAvailable = !!product && product.status === 'active' && product.quantity > 0;

  let status: WishlistItemStatus;
  if (item.status === 'sold') status = 'sold';
  else if (!productAvailable) status = 'unavailable';
  // The owner must not be able to tell that someone is mid-checkout on a gift.
  else if (item.status === 'reserved') status = isOwner ? 'available' : 'reserved';
  else status = 'available';

  const card = product ? toCard(product) : null;
  const recipientHasAddress = db.addresses.some((a) => a.userId === item.ownerId && a.isDefault);

  let giftBlockedReason: string | undefined;
  if (isOwner) giftBlockedReason = 'This is your wishlist';
  else if (!viewerId) giftBlockedReason = 'Sign in to send a gift';
  else if (status === 'sold') giftBlockedReason = 'Already sold';
  else if (status === 'reserved') giftBlockedReason = 'Someone is checking out this item';
  else if (status === 'unavailable') giftBlockedReason = 'No longer available';
  else if (product?.sellerId === viewerId) giftBlockedReason = "You can't gift your own listing";
  else if (!recipientHasAddress) giftBlockedReason = 'Gifting is not available for this person yet';

  const canBuy = !isOwner && status === 'available' && !!viewerId && product?.sellerId !== viewerId;

  return {
    id: item.id,
    position: item.position,
    status,
    product: card,
    productId: item.productId,
    title: product?.title ?? 'Removed listing',
    image: product?.images[0],
    priceCents: product?.priceCents ?? 0,
    canBuy,
    canGift: !giftBlockedReason,
    giftBlockedReason,
    addedAt: item.addedAt,
  };
}

function wishlistOf(ownerId: ID, viewerId: ID | null): WishlistView {
  sweepReservations();
  const db = getDb();
  const profile = profileOf(ownerId);
  const isOwner = viewerId === ownerId;
  const visible = isOwner || (profile.isPublic && profile.wishlistPublic);
  const items = visible
    ? db.wishlistItems
        .filter((w) => w.ownerId === ownerId)
        .sort((a, b) => a.position - b.position)
        .map((w) => itemView(w, viewerId))
    : [];
  return { owner: publicUser(ownerId), isOwner, isPublic: profile.wishlistPublic, visible, items };
}

export function myWishlist(): WishlistView {
  const user = me();
  return wishlistOf(user.id, user.id);
}

export function getWishlistByUsername(username: string): WishlistView {
  const profile = find(getDb().profiles, (p) => p.username === username.toLowerCase(), 'Profile');
  return wishlistOf(profile.userId, getSessionUserId());
}

export function addToWishlist(productId: ID) {
  const user = me();
  const db = getDb();
  const product = find(db.products, (p) => p.id === productId && p.status !== 'removed', 'Listing');
  assert(product.sellerId !== user.id, 'invalid', "You can't add your own listing to your wishlist");
  assert(!db.wishlistItems.some((w) => w.ownerId === user.id && w.productId === productId), 'conflict', 'Already on your wishlist');
  const mine = db.wishlistItems.filter((w) => w.ownerId === user.id);
  assert(mine.length < 100, 'invalid', 'Your wishlist is full (100 items)');
  db.wishlistItems.push({
    id: uid('w'),
    ownerId: user.id,
    productId,
    position: mine.length ? Math.max(...mine.map((w) => w.position)) + 1 : 0,
    status: 'available',
    addedAt: now(),
  });
  commit();
}

export function removeFromWishlist(itemId: ID) {
  const user = me();
  const db = getDb();
  const item = find(db.wishlistItems, (w) => w.id === itemId && w.ownerId === user.id, 'Wishlist item');
  // A reserved item stays until the checkout completes or expires (the owner simply doesn't see it).
  assert(item.status !== 'reserved', 'conflict', 'This item cannot be removed right now. Try again in a few minutes.');
  db.wishlistItems = db.wishlistItems.filter((w) => w.id !== itemId);
  commit();
}

export function removeProductFromWishlist(productId: ID) {
  const user = me();
  const item = getDb().wishlistItems.find((w) => w.ownerId === user.id && w.productId === productId);
  if (item) removeFromWishlist(item.id);
}

export function moveWishlistItem(itemId: ID, direction: -1 | 1) {
  const user = me();
  const db = getDb();
  const mine = db.wishlistItems.filter((w) => w.ownerId === user.id).sort((a, b) => a.position - b.position);
  const i = mine.findIndex((w) => w.id === itemId);
  assert(i >= 0, 'not_found', 'Wishlist item not found');
  const j = i + direction;
  if (j < 0 || j >= mine.length) return;
  [mine[i], mine[j]] = [mine[j], mine[i]];
  mine.forEach((w, idx) => (w.position = idx));
  commit();
}

export function setWishlistVisibility(isPublic: boolean) {
  const user = me();
  profileOf(user.id).wishlistPublic = isPublic;
  commit();
}

/* ---------------------------------------------------------- gifting -- */

export interface GiftQuote {
  reservationId: ID;
  expiresAt: number;
  recipient: { displayName: string; city: string };
  product: { id: ID; title: string; image?: string; seller: string };
  priceCents: number;
  shippingCents: number;
  protectionFeeCents: number;
  totalCents: number;
}

/**
 * Step 1: atomically reserve a wishlist item for a gift checkout.
 * JavaScript runs this synchronously, so check-and-set cannot interleave;
 * in Postgres the same logic runs in `reserve_wishlist_gift()` with
 * `SELECT … FOR UPDATE`.
 */
export function reserveGift(wishlistItemId: ID): GiftQuote {
  const user = me();
  sweepReservations();
  const db = getDb();
  const item = find(db.wishlistItems, (w) => w.id === wishlistItemId, 'Wishlist item');
  const owner = profileOf(item.ownerId);
  // Only items visible on a public wishlist can be gifted.
  assert(owner.isPublic && owner.wishlistPublic, 'forbidden', 'This wishlist is private');
  const view = itemView(item, user.id);
  if (!view.canGift) throw new HayveError('conflict', view.giftBlockedReason ?? 'This item cannot be gifted');
  const product = find(db.products, (p) => p.id === item.productId, 'Listing');

  // Respect units already reserved by other gift checkouts for the same product.
  const reservedUnits = db.wishlistItems.filter((w) => w.productId === product.id && w.status === 'reserved').length;
  assert(product.quantity - reservedUnits > 0, 'conflict', 'This item is being purchased by someone else right now');

  const reservation: GiftReservation = {
    id: uid('gr'),
    wishlistItemId: item.id,
    purchaserId: user.id,
    expiresAt: now() + RESERVATION_MS,
  };
  db.giftReservations.push(reservation);
  item.status = 'reserved';
  item.reservation = { id: reservation.id, expiresAt: reservation.expiresAt };
  commit();

  const fee = protectionFee(product.priceCents);
  return {
    reservationId: reservation.id,
    expiresAt: reservation.expiresAt,
    recipient: { displayName: owner.displayName, city: owner.city },
    product: { id: product.id, title: product.title, image: product.images[0], seller: displayName(product.sellerId) },
    priceCents: product.priceCents,
    shippingCents: SHIPPING_CENTS,
    protectionFeeCents: fee,
    totalCents: product.priceCents + SHIPPING_CENTS + fee,
  };
}

function reservationFor(reservationId: ID, purchaserId: ID) {
  const db = getDb();
  const r = db.giftReservations.find((x) => x.id === reservationId);
  if (!r || r.purchaserId !== purchaserId) throw new HayveError('not_found', 'Gift checkout not found or expired');
  return r;
}

/** Releases a reservation (checkout cancelled or failed). */
export function releaseGift(reservationId: ID) {
  const user = me();
  const db = getDb();
  const r = db.giftReservations.find((x) => x.id === reservationId && x.purchaserId === user.id);
  if (!r) return;
  const item = db.wishlistItems.find((w) => w.id === r.wishlistItemId);
  if (item && item.status === 'reserved' && item.reservation?.id === r.id) {
    item.status = 'available';
    item.reservation = undefined;
  }
  db.giftReservations = db.giftReservations.filter((x) => x.id !== r.id);
  commit();
}

export interface GiftReceipt {
  orderId: ID;
  reference: string;
  paymentTxId: ID;
  productTitle: string;
  recipientName: string;
  totalCents: number;
  status: Order['status'];
  createdAt: number;
}

/** Step 2: pay and convert the reservation into an anonymous gift order. */
export function confirmGift(reservationId: ID, method: PayMethod): GiftReceipt {
  const user = me();
  const db = getDb();
  const r = reservationFor(reservationId, user.id);
  if (r.expiresAt <= now()) {
    releaseGift(reservationId);
    throw new HayveError('conflict', 'Your reservation expired. Please start again.');
  }
  const item = find(db.wishlistItems, (w) => w.id === r.wishlistItemId, 'Wishlist item');
  assert(item.status === 'reserved' && item.reservation?.id === r.id, 'conflict', 'This item is no longer reserved for you');
  const product = find(db.products, (p) => p.id === item.productId, 'Listing');
  const address = db.addresses.find((a) => a.userId === item.ownerId && a.isDefault);

  let tx: ReturnType<typeof beginPayment> | null = null;
  try {
    assert(product.status === 'active' && product.quantity > 0, 'conflict', 'This item is no longer available');
    assert(address, 'conflict', 'Gifting is not available for this person yet');
    const fee = protectionFee(product.priceCents);
    const total = product.priceCents + SHIPPING_CENTS + fee;
    const orderId = uid('o');

    tx = beginPayment({
      payerId: user.id,
      method,
      type: 'gift_purchase',
      credits: [
        { accountId: accountIdFor(product.sellerId), amountCents: product.priceCents, status: 'pending' },
        { accountId: SYSTEM.fees, amountCents: SHIPPING_CENTS + fee },
      ],
      // The seller's ledger line shows "Hayve Gift", never the purchaser.
      labelForPayer: `Gift for ${displayName(item.ownerId)}`,
      labelForPayee: 'Hayve Gift',
      note: product.title,
      ref: { kind: 'order', id: orderId },
    });

    const order: Order = {
      id: orderId,
      reference: reference('HG'),
      kind: 'gift',
      productId: product.id,
      sellerId: product.sellerId,
      buyerId: null,
      recipientId: item.ownerId,
      shipTo: { fullName: address.fullName, line1: address.line1, city: address.city, postcode: address.postcode, country: address.country },
      priceCents: product.priceCents,
      shippingCents: SHIPPING_CENTS,
      protectionFeeCents: fee,
      totalCents: total,
      paymentTxId: tx.id,
      sellerTxId: tx.id,
      status: 'paid',
      timeline: [{ status: 'paid', at: now() }],
      createdAt: now(),
    };

    completePayment(tx, 'pending');
    db.orders.push(order);
    db.giftOrders.push({ id: uid('go'), orderId, wishlistItemId: item.id, purchaserId: user.id, recipientId: item.ownerId, createdAt: now() });
    item.status = 'sold';
    item.reservation = undefined;
    db.giftReservations = db.giftReservations.filter((x) => x.id !== r.id);
    product.quantity -= 1;
    if (product.quantity <= 0) product.status = 'sold_out';

    // Purchaser and seller are informed. The recipient deliberately is NOT.
    notify(user.id, 'order', 'Gift confirmed 🎁', `${product.title} for ${displayName(item.ownerId)} · ${order.reference}`, `/orders/${order.id}`);
    notify(product.sellerId, 'sale', 'New Hayve Gift order', `${product.title} sold. Ship to the address on the order within 3 days.`, `/orders/${order.id}`);
    audit(null, 'gift.confirm', order.id);
    commit();

    return {
      orderId,
      reference: order.reference,
      paymentTxId: tx.id,
      productTitle: product.title,
      recipientName: displayName(item.ownerId),
      totalCents: total,
      status: order.status,
      createdAt: order.createdAt,
    };
  } catch (e) {
    abortPayment(tx);
    // Release so the item becomes available again.
    if (item.status === 'reserved' && item.reservation?.id === r.id) {
      item.status = 'available';
      item.reservation = undefined;
    }
    db.giftReservations = db.giftReservations.filter((x) => x.id !== r.id);
    commit();
    throw e;
  }
}

export interface SentGiftView {
  orderId: ID;
  reference: string;
  recipientName: string;
  productTitle: string;
  image?: string;
  totalCents: number;
  status: Order['status'];
  createdAt: number;
}

export function giftsSent(): SentGiftView[] {
  const user = me();
  const db = getDb();
  return db.giftOrders
    .filter((g) => g.purchaserId === user.id)
    .map((g) => {
      const o = db.orders.find((x) => x.id === g.orderId)!;
      const p = db.products.find((x) => x.id === o.productId);
      return {
        orderId: o.id,
        reference: o.reference,
        recipientName: displayName(g.recipientId),
        productTitle: p?.title ?? 'Item',
        image: p?.images[0],
        totalCents: o.totalCents,
        status: o.status,
        createdAt: o.createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}
