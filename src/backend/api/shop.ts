import { accountIdFor, refundTransaction, releaseTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, reference, uid } from '../store';
import type { ID, Order, OrderStatus, Product, ProductCategory, ProductCondition } from '../types';
import {
  abortPayment,
  audit,
  beginPayment,
  completePayment,
  displayName,
  notify,
  type PayMethod,
  protectionFee,
  publicUser,
  type PublicUser,
  SHIPPING_CENTS,
} from './common';
import { getSessionUserId, me } from './session';

/* ------------------------------------------------------------ views -- */

export interface ProductCard {
  id: ID;
  title: string;
  priceCents: number;
  priceWithProtectionCents: number;
  image?: string;
  images: string[];
  condition: ProductCondition;
  category: ProductCategory;
  brand?: string;
  size?: string;
  location: string;
  favouriteCount: number;
  isFavourite: boolean;
  available: boolean;
  quantity: number;
  status: Product['status'];
  seller: PublicUser;
  isMine: boolean;
  createdAt: number;
}

export interface ProductDetail extends ProductCard {
  description: string;
  sellerRating: { average: number; count: number };
  sellerListings: number;
  onMyWishlist: boolean;
}

export const CONDITION_LABEL: Record<ProductCondition, string> = {
  new_with_tags: 'New with tags',
  new_without_tags: 'New without tags',
  very_good: 'Very good',
  good: 'Good',
  satisfactory: 'Satisfactory',
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  fashion: 'Fashion',
  electronics: 'Electronics',
  home: 'Home & furniture',
  accessories: 'Accessories',
  collectibles: 'Collectibles',
  books: 'Books & media',
  sport: 'Sport & outdoors',
  general: 'General goods',
};

export function toCard(p: Product): ProductCard {
  const db = getDb();
  const viewer = getSessionUserId();
  return {
    id: p.id,
    title: p.title,
    priceCents: p.priceCents,
    priceWithProtectionCents: p.priceCents + protectionFee(p.priceCents),
    image: p.images[0],
    images: p.images,
    condition: p.condition,
    category: p.category,
    brand: p.brand,
    size: p.size,
    location: p.location,
    favouriteCount: db.favourites.filter((f) => f.productId === p.id).length,
    isFavourite: !!viewer && db.favourites.some((f) => f.productId === p.id && f.userId === viewer),
    available: p.status === 'active' && p.quantity > 0,
    quantity: p.quantity,
    status: p.status,
    seller: publicUser(p.sellerId),
    isMine: viewer === p.sellerId,
    createdAt: p.createdAt,
  };
}

export function ratingFor(kind: 'user' | 'restaurant' | 'property' | 'vehicle' | 'driver', id: ID) {
  const rows = getDb().reviews.filter((r) => r.targetKind === kind && r.targetId === id);
  const average = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  return { average: Math.round(average * 10) / 10, count: rows.length };
}

/* ---------------------------------------------------------- browse -- */

export type ProductSort = 'recommended' | 'newest' | 'price_asc' | 'price_desc' | 'popular';

export interface ProductQuery {
  q?: string;
  category?: ProductCategory | 'all';
  minCents?: number;
  maxCents?: number;
  condition?: ProductCondition[];
  sort?: ProductSort;
  sellerId?: ID;
  includeSold?: boolean;
  limit?: number;
}

export function listProducts(query: ProductQuery = {}): ProductCard[] {
  const db = getDb();
  const q = query.q?.trim().toLowerCase();
  let rows = db.products.filter((p) => {
    if (p.status === 'removed') return false;
    if (!query.includeSold && (p.status !== 'active' || p.quantity <= 0)) return false;
    if (query.sellerId && p.sellerId !== query.sellerId) return false;
    if (query.category && query.category !== 'all' && p.category !== query.category) return false;
    if (query.minCents != null && p.priceCents < query.minCents) return false;
    if (query.maxCents != null && p.priceCents > query.maxCents) return false;
    if (query.condition?.length && !query.condition.includes(p.condition)) return false;
    if (q) {
      const hay = `${p.title} ${p.brand ?? ''} ${p.description} ${p.category}`.toLowerCase();
      if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const fav = (id: ID) => db.favourites.filter((f) => f.productId === id).length;
  switch (query.sort ?? 'recommended') {
    case 'newest':
      rows = rows.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case 'price_asc':
      rows = rows.sort((a, b) => a.priceCents - b.priceCents);
      break;
    case 'price_desc':
      rows = rows.sort((a, b) => b.priceCents - a.priceCents);
      break;
    case 'popular':
      rows = rows.sort((a, b) => fav(b.id) - fav(a.id));
      break;
    default:
      rows = rows.sort((a, b) => fav(b.id) * 3 - fav(a.id) * 3 + (b.createdAt - a.createdAt) / 86_400_000 / 10);
  }
  const cards = rows.map(toCard);
  return query.limit ? cards.slice(0, query.limit) : cards;
}

export function getProduct(id: ID): ProductDetail {
  const db = getDb();
  const p = find(db.products, (x) => x.id === id && x.status !== 'removed', 'Listing');
  const viewer = getSessionUserId();
  return {
    ...toCard(p),
    description: p.description,
    sellerRating: ratingFor('user', p.sellerId),
    sellerListings: db.products.filter((x) => x.sellerId === p.sellerId && x.status === 'active').length,
    onMyWishlist: !!viewer && db.wishlistItems.some((w) => w.ownerId === viewer && w.productId === id),
  };
}

export function toggleFavourite(productId: ID) {
  const user = me();
  const db = getDb();
  find(db.products, (p) => p.id === productId, 'Listing');
  const i = db.favourites.findIndex((f) => f.userId === user.id && f.productId === productId);
  if (i >= 0) db.favourites.splice(i, 1);
  else db.favourites.push({ userId: user.id, productId, createdAt: now() });
  commit();
  return i < 0;
}

export function myFavourites(): ProductCard[] {
  const user = me();
  const db = getDb();
  return db.favourites
    .filter((f) => f.userId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((f) => db.products.find((p) => p.id === f.productId))
    .filter((p): p is Product => !!p && p.status !== 'removed')
    .map(toCard);
}

/* --------------------------------------------------------- listings -- */

export interface ListingInput {
  title: string;
  description: string;
  priceCents: number;
  category: ProductCategory;
  condition: ProductCondition;
  brand?: string;
  size?: string;
  images: string[];
  quantity?: number;
}

function validateListing(input: ListingInput) {
  assert(input.title.trim().length >= 3, 'invalid', 'Add a title (at least 3 characters)');
  assert(input.title.trim().length <= 80, 'invalid', 'Title is too long');
  assert(input.description.trim().length >= 10, 'invalid', 'Describe your item (at least 10 characters)');
  assert(Number.isInteger(input.priceCents) && input.priceCents >= 100, 'invalid', 'Price must be at least €1.00');
  assert(input.priceCents <= 5_000_000, 'invalid', 'Price is too high');
  assert(input.images.length >= 1, 'invalid', 'Add at least one photo');
  assert(input.images.length <= 8, 'invalid', 'Up to 8 photos');
  assert((input.quantity ?? 1) >= 1 && (input.quantity ?? 1) <= 99, 'invalid', 'Quantity must be 1–99');
}

export function createListing(input: ListingInput): ID {
  const user = me();
  validateListing(input);
  const db = getDb();
  if (!user.roles.includes('seller')) user.roles.push('seller');
  const profile = db.profiles.find((p) => p.userId === user.id);
  const product: Product = {
    id: uid('p'),
    sellerId: user.id,
    title: input.title.trim(),
    description: input.description.trim(),
    priceCents: input.priceCents,
    category: input.category,
    condition: input.condition,
    brand: input.brand?.trim() || undefined,
    size: input.size?.trim() || undefined,
    images: input.images,
    quantity: input.quantity ?? 1,
    status: 'active',
    location: profile?.city ?? 'Amsterdam',
    createdAt: now(),
  };
  db.products.push(product);
  audit(user.id, 'listing.create', product.id);
  commit();
  return product.id;
}

function ownListing(id: ID) {
  const user = me();
  const p = find(getDb().products, (x) => x.id === id && x.status !== 'removed', 'Listing');
  if (p.sellerId !== user.id && !user.roles.includes('admin')) throw new HayveError('forbidden', 'This is not your listing');
  return p;
}

export function getListingForEdit(id: ID): ListingInput & { id: ID } {
  const p = ownListing(id);
  return { id: p.id, title: p.title, description: p.description, priceCents: p.priceCents, category: p.category, condition: p.condition, brand: p.brand, size: p.size, images: p.images, quantity: p.quantity };
}

export function updateListing(id: ID, input: ListingInput) {
  const p = ownListing(id);
  validateListing(input);
  Object.assign(p, {
    title: input.title.trim(),
    description: input.description.trim(),
    priceCents: input.priceCents,
    category: input.category,
    condition: input.condition,
    brand: input.brand?.trim() || undefined,
    size: input.size?.trim() || undefined,
    images: input.images,
    quantity: input.quantity ?? p.quantity,
  });
  if (p.quantity > 0 && p.status === 'sold_out') p.status = 'active';
  commit();
}

export function deleteListing(id: ID) {
  const p = ownListing(id);
  const db = getDb();
  const reserved = db.wishlistItems.some((w) => w.productId === id && w.status === 'reserved');
  assert(!reserved, 'conflict', 'Someone is checking out this item right now. Try again in a few minutes.');
  p.status = 'removed';
  audit(me().id, 'listing.delete', id);
  commit();
}

export function myListings() {
  const user = me();
  return getDb()
    .products.filter((p) => p.sellerId === user.id && p.status !== 'removed')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toCard);
}

/* --------------------------------------------------------- checkout -- */

export interface CheckoutQuote {
  priceCents: number;
  shippingCents: number;
  protectionFeeCents: number;
  totalCents: number;
}

export function quote(productId: ID): CheckoutQuote {
  const p = find(getDb().products, (x) => x.id === productId, 'Listing');
  const fee = protectionFee(p.priceCents);
  return { priceCents: p.priceCents, shippingCents: SHIPPING_CENTS, protectionFeeCents: fee, totalCents: p.priceCents + SHIPPING_CENTS + fee };
}

/** Ordinary purchase: the buyer pays and receives the item themselves. */
export function checkout(productId: ID, opts: { addressId: ID; method: PayMethod }) {
  const user = me();
  const db = getDb();
  const p = find(db.products, (x) => x.id === productId, 'Listing');
  assert(p.sellerId !== user.id, 'invalid', "You can't buy your own listing");
  assert(p.status === 'active' && p.quantity > 0, 'conflict', 'This item is no longer available');
  // Units currently reserved by gift checkouts are not for sale.
  const reservedUnits = db.wishlistItems.filter((w) => w.productId === p.id && w.status === 'reserved').length;
  assert(p.quantity - reservedUnits > 0, 'conflict', 'This item is being purchased by someone else right now');
  const address = find(db.addresses, (a) => a.id === opts.addressId && a.userId === user.id, 'Delivery address');

  const q = quote(productId);
  const orderId = uid('o');
  const tx = beginPayment({
    payerId: user.id,
    method: opts.method,
    type: 'purchase',
    credits: [
      { accountId: accountIdFor(p.sellerId), amountCents: q.priceCents, status: 'pending' },
      { accountId: SYSTEM.fees, amountCents: q.shippingCents + q.protectionFeeCents },
    ],
    labelForPayer: displayName(p.sellerId),
    labelForPayee: displayName(user.id),
    note: p.title,
    ref: { kind: 'order', id: orderId },
  });
  try {
    const order: Order = {
      id: orderId,
      reference: reference('HS'),
      kind: 'purchase',
      productId: p.id,
      sellerId: p.sellerId,
      buyerId: user.id,
      recipientId: user.id,
      shipTo: { fullName: address.fullName, line1: address.line1, city: address.city, postcode: address.postcode, country: address.country },
      priceCents: q.priceCents,
      shippingCents: q.shippingCents,
      protectionFeeCents: q.protectionFeeCents,
      totalCents: q.totalCents,
      paymentTxId: tx.id,
      sellerTxId: tx.id,
      status: 'paid',
      timeline: [{ status: 'paid', at: now() }],
      createdAt: now(),
    };
    completePayment(tx, 'pending');
    db.orders.push(order);
    p.quantity -= 1;
    if (p.quantity <= 0) p.status = 'sold_out';
    notify(user.id, 'order', 'Order confirmed', `${p.title} · ${order.reference}`, `/orders/${order.id}`);
    notify(p.sellerId, 'sale', 'You made a sale 🎉', `${p.title} sold to ${displayName(user.id)}. Ship within 3 days.`, `/orders/${order.id}`);
    commit();
    return { orderId: order.id, reference: order.reference };
  } catch (e) {
    abortPayment(tx);
    commit();
    throw e;
  }
}

/* ----------------------------------------------------------- orders -- */

export interface OrderView {
  id: ID;
  reference: string;
  kind: Order['kind'];
  role: 'buyer' | 'seller' | 'gift_purchaser';
  product: { id: ID; title: string; image?: string };
  counterparty: string;
  shipTo: Order['shipTo'] | null;
  shipToLabel: string;
  priceCents: number;
  shippingCents: number;
  protectionFeeCents: number;
  totalCents: number;
  /** What this viewer paid or earns. */
  amountCents: number;
  status: OrderStatus;
  timeline: Order['timeline'];
  createdAt: number;
  actions: ('ship' | 'deliver' | 'confirm' | 'cancel' | 'fail_delivery')[];
}

function productSummary(id: ID) {
  const p = getDb().products.find((x) => x.id === id);
  return { id, title: p?.title ?? 'Removed listing', image: p?.images[0] };
}

/**
 * Builds the order as one specific party is allowed to see it.
 * Gift orders: the seller sees an anonymous Hayve Gift order (address needed to
 * ship, no purchaser); the purchaser sees no address; the recipient sees nothing.
 */
export function viewOrder(order: Order, viewerId: ID): OrderView | null {
  const db = getDb();
  let role: OrderView['role'] | null = null;
  if (order.sellerId === viewerId) role = 'seller';
  else if (order.kind === 'purchase' && order.buyerId === viewerId) role = 'buyer';
  else if (order.kind === 'gift' && db.giftOrders.some((g) => g.orderId === order.id && g.purchaserId === viewerId)) role = 'gift_purchaser';
  if (!role) return null;

  const actions: OrderView['actions'] = [];
  if (role === 'seller') {
    if (order.status === 'paid') actions.push('ship', 'cancel');
    if (order.status === 'shipped') actions.push('deliver', 'fail_delivery');
  } else if (order.status === 'paid') actions.push('cancel');
  if (role === 'buyer' && order.status === 'delivered') actions.push('confirm');

  let counterparty: string;
  let shipTo: Order['shipTo'] | null = order.shipTo;
  let shipToLabel = `${order.shipTo.fullName}, ${order.shipTo.city}`;
  if (role === 'seller') {
    counterparty = order.kind === 'gift' ? 'Hayve Gift · anonymous buyer' : displayName(order.buyerId!);
  } else {
    counterparty = displayName(order.sellerId);
  }
  if (role === 'gift_purchaser') {
    shipTo = null;
    shipToLabel = `${displayName(order.recipientId)}'s saved address (private)`;
  }

  return {
    id: order.id,
    reference: order.reference,
    kind: order.kind,
    role,
    product: productSummary(order.productId),
    counterparty,
    shipTo,
    shipToLabel,
    priceCents: order.priceCents,
    shippingCents: order.shippingCents,
    protectionFeeCents: order.protectionFeeCents,
    totalCents: order.totalCents,
    amountCents: role === 'seller' ? order.priceCents : order.totalCents,
    status: order.status,
    timeline: order.timeline,
    createdAt: order.createdAt,
    actions,
  };
}

export function listPurchases(): OrderView[] {
  const user = me();
  return getDb()
    .orders.filter((o) => o.kind === 'purchase' && o.buyerId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => viewOrder(o, user.id)!)
    .filter(Boolean);
}

export function listSales(): OrderView[] {
  const user = me();
  return getDb()
    .orders.filter((o) => o.sellerId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => viewOrder(o, user.id)!)
    .filter(Boolean);
}

export function getOrder(id: ID): OrderView {
  const user = me();
  const order = find(getDb().orders, (o) => o.id === id, 'Order');
  const view = viewOrder(order, user.id);
  if (!view) throw new HayveError('not_found', 'Order not found');
  return view;
}

function restoreAfterCancel(order: Order) {
  const db = getDb();
  const p = db.products.find((x) => x.id === order.productId);
  if (p && p.status !== 'removed') {
    p.quantity += 1;
    if (p.status === 'sold_out') p.status = 'active';
  }
  if (order.kind === 'gift') {
    const g = db.giftOrders.find((x) => x.orderId === order.id);
    const item = g && db.wishlistItems.find((w) => w.id === g.wishlistItemId);
    if (item && item.status === 'sold') item.status = 'available';
  }
}

export function updateOrder(id: ID, action: OrderView['actions'][number]) {
  const user = me();
  const db = getDb();
  const order = find(db.orders, (o) => o.id === id, 'Order');
  const view = viewOrder(order, user.id);
  if (!view) throw new HayveError('not_found', 'Order not found');
  assert(view.actions.includes(action), 'forbidden', 'That action is not available for this order');
  const title = view.product.title;
  const push = (s: Order['timeline'][number]['status']) => order.timeline.push({ status: s, at: now() });
  const buyerOrPurchaser = () =>
    order.kind === 'gift' ? db.giftOrders.find((g) => g.orderId === order.id)!.purchaserId : order.buyerId!;

  switch (action) {
    case 'ship':
      order.status = 'shipped';
      push('label_created');
      push('shipped');
      notify(buyerOrPurchaser(), 'delivery', 'Your order is on its way', `${title} has shipped.`, `/orders/${order.id}`);
      break;
    case 'deliver':
      order.status = 'delivered';
      push('delivered');
      if (order.kind === 'gift') {
        // Gifts complete automatically; the recipient is never asked to confirm.
        order.status = 'completed';
        push('completed');
        releaseTransaction(order.sellerTxId);
        notify(buyerOrPurchaser(), 'delivery', 'Gift delivered 🎁', `${title} was delivered.`, `/orders/${order.id}`);
      } else {
        notify(order.buyerId!, 'delivery', 'Delivered', `${title} was delivered. Confirm everything is OK.`, `/orders/${order.id}`);
      }
      break;
    case 'confirm':
      order.status = 'completed';
      push('completed');
      releaseTransaction(order.sellerTxId);
      notify(order.sellerId, 'payment', 'Funds released', `Earnings for ${title} are now available.`, '/pay');
      break;
    case 'cancel':
    case 'fail_delivery': {
      order.status = 'refunded';
      push(action === 'cancel' ? 'cancelled' : 'refunded');
      refundTransaction(order.paymentTxId, action === 'cancel' ? 'Order cancelled' : 'Delivery failed');
      // Gifts pay the seller from escrow in a separate transaction: reverse it too.
      if (order.sellerTxId !== order.paymentTxId) refundTransaction(order.sellerTxId, 'Gift cancelled');
      restoreAfterCancel(order);
      const party = buyerOrPurchaser();
      notify(party, 'refund', 'Refund issued', `${title}: ${(order.totalCents / 100).toFixed(2)} EUR returned to your Hayve Pay balance.`, `/orders/${order.id}`);
      if (user.id !== order.sellerId) notify(order.sellerId, 'sale', 'Order cancelled', `${title} was cancelled by the buyer.`, `/orders/${order.id}`);
      break;
    }
  }
  audit(user.id, `order.${action}`, order.id);
  commit();
}
