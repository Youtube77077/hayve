import { fmtMoney } from '../regions';
import { accountIdFor, createTransaction, SYSTEM } from '../ledger';
import { assert, commit, find, getDb, HayveError, now, reference, uid } from '../store';
import type { FoodOrder, FoodOrderLine, FoodOrderStatus, ID, MenuItem, Restaurant } from '../types';
import { abortPayment, audit, beginPayment, completePayment, displayName, notify, type PayMethod, previewWaveBack } from './common';
import { getSessionUserId, me, requireRole } from './session';
import { disclosed, priceFor, pricingState, recordPrice } from './revenue';

/** Hayve Bites (customers) and Hayve Kitchen (restaurants). */

/** Default Bites service fee (the live amount is the 'bites_service' pricing rule). */
export const SERVICE_FEE_CENTS = 149;

export interface RestaurantQuery {
  q?: string;
  tag?: string;
  groceries?: boolean;
  sort?: 'recommended' | 'rating' | 'eta' | 'fee';
  openOnly?: boolean;
}

export function listRestaurants(query: RestaurantQuery = {}): Restaurant[] {
  const q = query.q?.trim().toLowerCase();
  let rows = getDb().restaurants.filter((r) => {
    if (query.groceries != null && r.isGrocery !== query.groceries) return false;
    if (query.openOnly && !r.isOpen) return false;
    if (query.tag && !r.tags.includes(query.tag)) return false;
    if (q) {
      const items = getDb().menuItems.filter((m) => m.restaurantId === r.id).map((m) => m.name).join(' ');
      if (!`${r.name} ${r.cuisine} ${r.tags.join(' ')} ${items}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  switch (query.sort) {
    case 'rating':
      rows = rows.sort((a, b) => b.rating - a.rating);
      break;
    case 'eta':
      rows = rows.sort((a, b) => a.etaMin - b.etaMin);
      break;
    case 'fee':
      rows = rows.sort((a, b) => a.deliveryFeeCents - b.deliveryFeeCents);
      break;
    default:
      rows = rows.sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || b.rating * Math.log(b.ratingCount) - a.rating * Math.log(a.ratingCount));
  }
  return rows;
}

export const CUISINES = ['Pizza', 'Burgers', 'Healthy', 'Thai', 'Sushi', 'Indian', 'Bakery', 'Vegan', 'Breakfast', 'Groceries'];

export function getRestaurant(id: ID) {
  const db = getDb();
  const r = find(db.restaurants, (x) => x.id === id, 'Restaurant');
  const menu = db.menuItems.filter((m) => m.restaurantId === id);
  const categories = Array.from(new Set(menu.map((m) => m.category)));
  const reviews = db.reviews.filter((rv) => rv.targetKind === 'restaurant' && rv.targetId === id).map((rv) => ({ ...rv, author: displayName(rv.authorId) }));
  return { restaurant: r, menu, categories, reviews };
}

export interface CartLine {
  key: string;
  menuItemId: ID;
  qty: number;
  options: string[];
}

export function priceCart(restaurantId: ID, lines: CartLine[]) {
  const db = getDb();
  const r = find(db.restaurants, (x) => x.id === restaurantId, 'Restaurant');
  const priced: FoodOrderLine[] = lines.map((l) => {
    const item = find(db.menuItems, (m) => m.id === l.menuItemId && m.restaurantId === restaurantId, 'Menu item');
    let unit = item.priceCents;
    for (const opt of l.options) {
      for (const group of item.options) {
        const choice = group.choices.find((c) => c.label === opt);
        if (choice) unit += choice.priceCents;
      }
    }
    return { menuItemId: item.id, name: item.name, qty: l.qty, unitCents: unit, options: l.options };
  });
  const subtotal = priced.reduce((s, l) => s + l.unitCents * l.qty, 0);
  // Fees from the pricing engine (service fee, small-order fee, busy-time…), all disclosed.
  const price = priceFor('bites', subtotal, { orderCents: subtotal });
  const fees = disclosed(price);
  const feesCents = fees.reduce((a, f) => a + f.cents, 0);
  const smallOrder = price.customerLines.find((l) => l.component === 'small_order_fee');
  const smallRule = smallOrder ? pricingState().rules.find((x) => x.id === smallOrder.ruleId) : null;
  return {
    lines: priced,
    subtotalCents: subtotal,
    deliveryFeeCents: r.deliveryFeeCents,
    serviceFeeCents: feesCents,
    fees,
    /** How much more to add to avoid the small-order fee (shown next to it). */
    addToAvoidSmallOrderCents: smallRule?.conditions.maxOrderCents ? smallRule.conditions.maxOrderCents - subtotal : 0,
    commissionCents: price.supplierLines.reduce((a, l) => a + l.cents, 0),
    breakdown: price,
    totalCents: subtotal + r.deliveryFeeCents + feesCents,
    minOrderCents: r.minOrderCents,
    meetsMinimum: subtotal >= r.minOrderCents,
    waveBackCents: previewWaveBack(getSessionUserId(), 'services', subtotal),
  };
}

export function placeFoodOrder(input: { restaurantId: ID; lines: CartLine[]; address: string; note?: string; method: PayMethod }) {
  const user = me();
  const db = getDb();
  const r = find(db.restaurants, (x) => x.id === input.restaurantId, 'Restaurant');
  assert(r.isOpen, 'conflict', `${r.name} is closed right now`);
  assert(input.lines.length > 0, 'invalid', 'Your basket is empty');
  assert(input.address.trim().length >= 5, 'invalid', 'Enter a delivery address');
  for (const l of input.lines) {
    const item = find(db.menuItems, (m) => m.id === l.menuItemId, 'Menu item');
    assert(item.available, 'conflict', `${item.name} is sold out`);
    assert(l.qty >= 1 && l.qty <= 50, 'invalid', 'Invalid quantity');
    for (const g of item.options.filter((o) => o.required)) {
      assert(l.options.some((o) => g.choices.some((c) => c.label === o)), 'invalid', `Choose ${g.name.toLowerCase()} for ${item.name}`);
    }
  }
  const priced = priceCart(r.id, input.lines);
  assert(priced.meetsMinimum, 'invalid', `Minimum order is ${fmtMoney(r.minOrderCents)}`);
  const id = uid('fo');
  const restaurantShare = priced.subtotalCents - priced.commissionCents;
  const tx = beginPayment({
    payerId: user.id,
    method: input.method,
    type: 'food_order',
    credits: [
      { accountId: accountIdFor(r.ownerId), amountCents: restaurantShare },
      { accountId: SYSTEM.fees, amountCents: priced.totalCents - restaurantShare },
    ],
    labelForPayer: r.name,
    labelForPayee: `Hayve Bites order · ${displayName(user.id)}`,
    ref: { kind: 'food', id },
    // Wave Back applies to the food, never to delivery or service fees.
    waveBack: { category: 'services', baseCents: priced.subtotalCents },
  });
  recordPrice('bites', id, priced.breakdown, { orderCents: priced.subtotalCents });
  const order: FoodOrder = {
    id,
    reference: reference('HB'),
    customerId: user.id,
    restaurantId: r.id,
    courierId: null,
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    deliveryFeeCents: priced.deliveryFeeCents,
    serviceFeeCents: priced.serviceFeeCents,
    totalCents: priced.totalCents,
    address: input.address.trim(),
    note: input.note?.trim() ?? '',
    status: 'placed',
    paymentTxId: tx.id,
    createdAt: now(),
    timeline: [{ status: 'placed', at: now() }],
  };
  db.foodOrders.push(order);
  notify(r.ownerId, 'order', 'New order', `${order.reference} · ${priced.lines.reduce((s, l) => s + l.qty, 0)} items · ${fmtMoney(priced.totalCents)}`, '/business/kitchen');
  commit();
  return id;
}

export interface FoodOrderView extends FoodOrder {
  restaurant: Pick<Restaurant, 'id' | 'name' | 'image' | 'etaMin' | 'address' | 'logoColor'>;
  customerName: string;
  courierName: string | null;
}

function viewFood(o: FoodOrder): FoodOrderView {
  const r = getDb().restaurants.find((x) => x.id === o.restaurantId)!;
  return {
    ...o,
    restaurant: { id: r.id, name: r.name, image: r.image, etaMin: r.etaMin, address: r.address, logoColor: r.logoColor },
    customerName: displayName(o.customerId),
    courierName: o.courierId ? displayName(o.courierId) : null,
  };
}

export function myFoodOrders() {
  const user = me();
  return getDb()
    .foodOrders.filter((o) => o.customerId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(viewFood);
}

export function getFoodOrder(id: ID) {
  const user = me();
  const db = getDb();
  const o = find(db.foodOrders, (x) => x.id === id, 'Order');
  const r = db.restaurants.find((x) => x.id === o.restaurantId)!;
  if (o.customerId !== user.id && r.ownerId !== user.id && o.courierId !== user.id && !user.roles.includes('admin')) {
    throw new HayveError('not_found', 'Order not found');
  }
  return viewFood(o);
}

function setFoodStatus(o: FoodOrder, status: FoodOrderStatus) {
  const db = getDb();
  o.status = status;
  o.timeline.push({ status, at: now() });
  const r = db.restaurants.find((x) => x.id === o.restaurantId)!;
  const tx = db.transactions.find((t) => t.id === o.paymentTxId);
  if (status === 'accepted' && tx?.status === 'reserved') completePayment(tx);
  if ((status === 'rejected' || status === 'cancelled') && tx?.status === 'reserved') abortPayment(tx);
  const msgs: Partial<Record<FoodOrderStatus, string>> = {
    accepted: `${r.name} accepted your order`,
    preparing: `${r.name} is preparing your food`,
    picked_up: 'Your courier picked up your order',
    delivered: 'Enjoy your meal! Order delivered.',
    rejected: `${r.name} couldn't take your order. You were not charged.`,
  };
  if (msgs[status]) notify(o.customerId, 'delivery', `Order ${o.reference}`, msgs[status]!, `/bites/order/${o.id}`);
  if (status === 'delivered' && o.courierId) {
    createTransaction({
      type: 'earning',
      fromAccountId: SYSTEM.fees,
      credits: [{ accountId: accountIdFor(o.courierId), amountCents: o.deliveryFeeCents + 250 }],
      labelForFrom: displayName(o.courierId),
      labelForTo: 'Hayve Courier delivery',
      note: `${r.name} · ${o.reference}`,
      method: 'system',
      ref: { kind: 'food', id: o.id },
    });
    const cp = db.couriers.find((c) => c.userId === o.courierId);
    if (cp) cp.jobs += 1;
  }
}

export function cancelFoodOrder(id: ID) {
  const user = me();
  const o = find(getDb().foodOrders, (x) => x.id === id && x.customerId === user.id, 'Order');
  assert(o.status === 'placed', 'conflict', 'The restaurant has already accepted this order');
  setFoodStatus(o, 'cancelled');
  commit();
}

export function rateFoodOrder(id: ID, rating: number, text = '') {
  const user = me();
  const db = getDb();
  const o = find(db.foodOrders, (x) => x.id === id && x.customerId === user.id, 'Order');
  assert(o.status === 'delivered', 'conflict', 'Rate your order once it is delivered');
  o.rating = rating;
  db.reviews.push({ id: uid('rv'), authorId: user.id, targetKind: 'restaurant', targetId: o.restaurantId, rating, text, createdAt: now() });
  commit();
}

/** Simulation: progress an order when the restaurant/courier don't act (customer tracking screen). */
export function simulateFoodStep(id: ID) {
  const user = me();
  const db = getDb();
  const o = find(db.foodOrders, (x) => x.id === id && x.customerId === user.id, 'Order');
  const next: Partial<Record<FoodOrderStatus, FoodOrderStatus>> = {
    placed: 'accepted',
    accepted: 'preparing',
    preparing: 'ready',
    ready: 'picked_up',
    picked_up: 'delivered',
  };
  const to = next[o.status];
  if (!to) return o.status;
  if (to === 'picked_up' && !o.courierId) {
    o.courierId = (db.couriers.find((c) => c.online && c.userId !== o.customerId) ?? db.couriers[0])?.userId ?? null;
  }
  setFoodStatus(o, to);
  commit();
  return o.status;
}

/* ---------------------------------------------------- Hayve Kitchen -- */

export function registerRestaurant(input: { name: string; cuisine: string; address: string; description: string; image?: string; isGrocery?: boolean }) {
  const user = me();
  const db = getDb();
  assert(input.name.trim().length >= 2, 'invalid', 'Enter your restaurant name');
  assert(input.cuisine.trim().length >= 2, 'invalid', 'Enter a cuisine');
  assert(input.address.trim().length >= 5, 'invalid', 'Enter your address');
  const r: Restaurant = {
    id: uid('rs'),
    ownerId: user.id,
    name: input.name.trim(),
    cuisine: input.cuisine.trim(),
    description: input.description.trim(),
    image: input.image || '',
    logoColor: '#3A1FD1',
    rating: 5,
    ratingCount: 0,
    deliveryFeeCents: 199,
    minOrderCents: 1000,
    etaMin: 30,
    priceLevel: 2,
    tags: input.cuisine.split(/[,·]/).map((s) => s.trim()).filter(Boolean),
    address: input.address.trim(),
    isOpen: false,
    isGrocery: !!input.isGrocery,
    createdAt: now(),
  };
  db.restaurants.push(r);
  if (!user.roles.includes('kitchen')) user.roles.push('kitchen');
  audit(user.id, 'kitchen.register', r.id);
  commit();
  return r.id;
}

function ownRestaurant(id: ID) {
  const user = requireRole('kitchen');
  const r = find(getDb().restaurants, (x) => x.id === id, 'Restaurant');
  if (r.ownerId !== user.id) throw new HayveError('forbidden', 'Not your restaurant');
  return r;
}

export function myRestaurants() {
  const user = requireRole('kitchen');
  return getDb().restaurants.filter((r) => r.ownerId === user.id);
}

export function updateRestaurant(id: ID, patch: Partial<Pick<Restaurant, 'name' | 'description' | 'isOpen' | 'etaMin' | 'deliveryFeeCents' | 'minOrderCents' | 'image' | 'promo'>>) {
  const r = ownRestaurant(id);
  Object.assign(r, patch);
  commit();
}

export function upsertMenuItem(restaurantId: ID, input: Partial<MenuItem> & { name: string; priceCents: number; category: string }) {
  ownRestaurant(restaurantId);
  const db = getDb();
  assert(input.name.trim().length >= 2, 'invalid', 'Enter an item name');
  assert(Number.isInteger(input.priceCents) && input.priceCents >= 50, 'invalid', `Price must be at least ${fmtMoney(50)}`);
  assert(input.category.trim().length >= 2, 'invalid', 'Enter a menu section');
  if (input.id) {
    const item = find(db.menuItems, (m) => m.id === input.id && m.restaurantId === restaurantId, 'Menu item');
    Object.assign(item, { ...input, name: input.name.trim(), category: input.category.trim() });
  } else {
    db.menuItems.push({
      id: uid('mi'),
      restaurantId,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      priceCents: input.priceCents,
      image: input.image,
      category: input.category.trim(),
      available: true,
      options: [],
    });
  }
  commit();
}

export function deleteMenuItem(restaurantId: ID, itemId: ID) {
  ownRestaurant(restaurantId);
  const db = getDb();
  db.menuItems = db.menuItems.filter((m) => !(m.id === itemId && m.restaurantId === restaurantId));
  commit();
}

export function kitchenOrders(restaurantId?: ID) {
  const user = requireRole('kitchen');
  const db = getDb();
  const mine = new Set(db.restaurants.filter((r) => r.ownerId === user.id && (!restaurantId || r.id === restaurantId)).map((r) => r.id));
  return db.foodOrders
    .filter((o) => mine.has(o.restaurantId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(viewFood);
}

export function kitchenUpdate(orderId: ID, to: 'accepted' | 'rejected' | 'preparing' | 'ready') {
  const user = requireRole('kitchen');
  const db = getDb();
  const o = find(db.foodOrders, (x) => x.id === orderId, 'Order');
  const r = find(db.restaurants, (x) => x.id === o.restaurantId, 'Restaurant');
  if (r.ownerId !== user.id) throw new HayveError('forbidden', 'Not your order');
  const allowed: Record<string, FoodOrderStatus[]> = { placed: ['accepted', 'rejected'], accepted: ['preparing'], preparing: ['ready'] };
  assert(allowed[o.status]?.includes(to), 'conflict', 'That update is not possible right now');
  setFoodStatus(o, to);
  commit();
}

/* --------------------------------- Courier side of food deliveries -- */

export function courierFoodJobs() {
  const user = requireRole('courier');
  const db = getDb();
  return db.foodOrders
    .filter((o) => (o.status === 'ready' && !o.courierId) || (o.courierId === user.id && ['ready', 'picked_up'].includes(o.status)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(viewFood);
}

export function courierFoodAction(orderId: ID, action: 'accept' | 'pickup' | 'deliver') {
  const user = requireRole('courier');
  const o = find(getDb().foodOrders, (x) => x.id === orderId, 'Order');
  if (action === 'accept') {
    assert(o.status === 'ready' && !o.courierId, 'conflict', 'Job no longer available');
    o.courierId = user.id;
  } else if (action === 'pickup') {
    assert(o.courierId === user.id && o.status === 'ready', 'conflict', 'Not ready for pickup');
    setFoodStatus(o, 'picked_up');
  } else {
    assert(o.courierId === user.id && o.status === 'picked_up', 'conflict', 'Pick up the order first');
    setFoodStatus(o, 'delivered');
  }
  commit();
}
