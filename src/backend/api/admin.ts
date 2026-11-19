import { ledgerIsBalanced } from '../ledger';
import { assert, commit, find, getDb } from '../store';
import type { ID, Role } from '../types';
import { audit, displayName } from './common';
import { requireRole } from './session';

/**
 * Admin console. Every function requires the `admin` role (enforced here and by
 * the `is_admin()` RLS helper in Supabase). Gift purchaser identities are
 * deliberately NOT exposed here either: only the fulfilment service role can
 * read `private.gift_orders`.
 */

export function overview() {
  requireRole('admin');
  const db = getDb();
  const gmv = db.transactions.filter((t) => ['purchase', 'gift_purchase', 'food_order', 'ride', 'rental', 'stay', 'delivery', 'merchant_payment'].includes(t.type) && (t.status === 'completed' || t.status === 'pending')).reduce((s, t) => s + t.amountCents, 0);
  return {
    users: db.users.filter((u) => !u.deletedAt).length,
    businesses: db.businesses.length,
    listings: db.products.filter((p) => p.status === 'active').length,
    orders: db.orders.length,
    foodOrders: db.foodOrders.length,
    rides: db.rides.length,
    rentals: db.rentals.length,
    stays: db.stayBookings.length,
    deliveries: db.deliveries.length,
    restaurants: db.restaurants.length,
    properties: db.properties.length,
    vehicles: db.vehicles.length,
    transactions: db.transactions.length,
    gmvCents: gmv,
    ledgerBalanced: ledgerIsBalanced(),
  };
}

export function users() {
  requireRole('admin');
  const db = getDb();
  return db.users.map((u) => {
    const p = db.profiles.find((x) => x.userId === u.id);
    return { id: u.id, email: u.email, roles: u.roles, displayName: p?.displayName ?? '—', username: p?.username ?? '—', avatar: p?.avatar, deleted: !!u.deletedAt, createdAt: u.createdAt };
  });
}

export function setRole(userId: ID, role: Role, on: boolean) {
  const admin = requireRole('admin');
  const u = find(getDb().users, (x) => x.id === userId, 'User');
  assert(!(userId === admin.id && role === 'admin' && !on), 'invalid', "You can't remove your own admin role");
  if (on && !u.roles.includes(role)) u.roles.push(role);
  if (!on) u.roles = u.roles.filter((r) => r !== role);
  audit(admin.id, `role.${on ? 'grant' : 'revoke'}.${role}`, userId);
  commit();
}

export function listings() {
  requireRole('admin');
  const db = getDb();
  return db.products.map((p) => ({ id: p.id, title: p.title, image: p.images[0], priceCents: p.priceCents, status: p.status, seller: displayName(p.sellerId), createdAt: p.createdAt })).sort((a, b) => b.createdAt - a.createdAt);
}

export function moderateListing(id: ID, action: 'remove' | 'restore') {
  const admin = requireRole('admin');
  const p = find(getDb().products, (x) => x.id === id, 'Listing');
  p.status = action === 'remove' ? 'removed' : p.quantity > 0 ? 'active' : 'sold_out';
  audit(admin.id, `moderation.${action}`, id);
  commit();
}

export function orders() {
  requireRole('admin');
  const db = getDb();
  return db.orders
    .map((o) => ({
      id: o.id,
      reference: o.reference,
      kind: o.kind,
      product: db.products.find((p) => p.id === o.productId)?.title ?? '—',
      seller: displayName(o.sellerId),
      // Gift purchaser identity is sealed even for admins.
      buyer: o.kind === 'gift' ? 'Sealed (anonymous gift)' : displayName(o.buyerId!),
      totalCents: o.totalCents,
      status: o.status,
      createdAt: o.createdAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function transactions() {
  requireRole('admin');
  const db = getDb();
  const label = (accId: string) => {
    const acc = db.accounts.find((a) => a.id === accId);
    return acc?.ownerId ? displayName(acc.ownerId) : acc?.label ?? accId;
  };
  return db.transactions
    .map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amountCents: t.amountCents,
      method: t.method,
      // A gift's payer is shown as the ledger account only for gift_purchase rows the fulfilment role needs; admins see "Gift purchaser".
      from: t.type === 'gift_purchase' ? 'Gift purchaser (sealed)' : label(t.fromAccountId),
      to: label(t.toAccountId),
      createdAt: t.createdAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function services() {
  requireRole('admin');
  const db = getDb();
  return {
    restaurants: db.restaurants.map((r) => ({ id: r.id, name: r.name, owner: displayName(r.ownerId), isOpen: r.isOpen, orders: db.foodOrders.filter((o) => o.restaurantId === r.id).length })),
    rides: db.rides.map((r) => ({ id: r.id, rider: displayName(r.riderId), driver: r.driverId ? displayName(r.driverId) : '—', status: r.status, priceCents: r.priceCents, createdAt: r.createdAt })),
    rentals: db.rentals.map((r) => ({ id: r.id, reference: r.reference, renter: displayName(r.renterId), status: r.status, totalCents: r.totalCents })),
    stays: db.stayBookings.map((b) => ({ id: b.id, reference: b.reference, guest: displayName(b.guestId), status: b.status, totalCents: b.totalCents })),
    deliveries: db.deliveries.map((d) => ({ id: d.id, trackingCode: d.trackingCode, sender: displayName(d.senderId), status: d.status, priceCents: d.priceCents })),
    properties: db.properties.map((p) => ({ id: p.id, title: p.title, host: displayName(p.hostId), listed: p.listed })),
    vehicles: db.vehicles.map((v) => ({ id: v.id, title: `${v.make} ${v.model}`, host: displayName(v.hostId), listed: v.listed })),
    businesses: db.businesses.map((b) => ({ id: b.id, name: b.tradingName, owner: displayName(b.ownerId), status: b.verification.status })),
  };
}

export function auditLog() {
  requireRole('admin');
  const db = getDb();
  return db.audit
    .slice(-200)
    .reverse()
    .map((a) => ({ ...a, actor: a.actorId ? displayName(a.actorId) : 'system' }));
}
