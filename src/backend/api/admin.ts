import { DEFAULT_FEE_TIERS, DEFAULT_WAVE_BACK, type FeeTier, marketplaceFeeCents, type WaveBackSettings } from '../config';
import { ledgerIsBalanced } from '../ledger';
import { assert, commit, find, getDb, HayveError, now } from '../store';
import type { ID, Role } from '../types';
import { audit, displayName, notify, publicUser, settings } from './common';
import { requireAdmin } from './session';

/**
 * Admin console. Every function requires the admin role plus a verified email
 * and two-step verification (requireAdmin). Every action is written to the
 * audit log (who, what, when). Gift purchaser identities stay sealed here too.
 */

const log = (actorId: ID, action: string, target: string) => audit(actorId, action, target);

/* ------------------------------------------------------------ overview -- */

export function overview() {
  requireAdmin();
  const db = getDb();
  const liveOrders = db.orders.filter((o) => o.status !== 'refunded' && o.status !== 'cancelled');
  const waveBack = db.transactions.filter((t) => t.type === 'wave_back' && t.status === 'completed');
  return {
    users: db.users.filter((u) => !u.deletedAt).length,
    suspended: db.users.filter((u) => u.suspendedAt && !u.deletedAt).length,
    orders: db.orders.length + db.foodOrders.length + db.rides.length + db.rentals.length + db.stayBookings.length,
    shopOrders: db.orders.length,
    feeRevenueCents: liveOrders.reduce((s, o) => s + o.feeCents, 0),
    waveBackPaidCents: waveBack.reduce((s, t) => s + t.amountCents, 0),
    waveBackCount: waveBack.length,
    pendingVerifications: db.businesses.filter((b) => b.status === 'pending').length,
    openReports: db.reports.filter((r) => r.status === 'open').length,
    listings: db.products.filter((p) => p.status === 'active').length,
    ledgerBalanced: ledgerIsBalanced(),
  };
}

/* --------------------------------------------------------------- users -- */

export function users(q = '') {
  requireAdmin();
  const db = getDb();
  const term = q.trim().toLowerCase();
  return db.users
    .map((u) => {
      const p = db.profiles.find((x) => x.userId === u.id);
      return {
        id: u.id,
        email: u.email,
        roles: u.roles,
        displayName: p?.displayName ?? '—',
        username: p?.username ?? '—',
        avatar: p?.avatar,
        bio: p?.bio ?? '',
        deleted: !!u.deletedAt,
        suspended: !!u.suspendedAt,
        suspensionReason: u.suspensionReason,
        createdAt: u.createdAt,
      };
    })
    .filter((u) => !term || `${u.email} ${u.displayName} ${u.username}`.toLowerCase().includes(term))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function suspendUser(userId: ID, reason: string) {
  const admin = requireAdmin();
  assert(userId !== admin.id, 'invalid', "You can't suspend your own account");
  assert(reason.trim().length >= 3, 'invalid', 'Give a reason');
  const u = find(getDb().users, (x) => x.id === userId, 'User');
  u.suspendedAt = now();
  u.suspensionReason = reason.trim();
  log(admin.id, 'user.suspend', `${userId}: ${reason.trim()}`);
  commit();
}

export function unsuspendUser(userId: ID) {
  const admin = requireAdmin();
  const u = find(getDb().users, (x) => x.id === userId, 'User');
  u.suspendedAt = undefined;
  u.suspensionReason = undefined;
  log(admin.id, 'user.unsuspend', userId);
  commit();
}

/** Deletes (anonymises) a user. Completed order and payment records are kept anonymised. */
export function deleteUser(userId: ID) {
  const admin = requireAdmin();
  assert(userId !== admin.id, 'invalid', "You can't delete your own account here");
  const db = getDb();
  const u = find(db.users, (x) => x.id === userId && !x.deletedAt, 'User');
  u.deletedAt = now();
  u.email = `deleted+${u.id}@hayve.invalid`;
  const p = db.profiles.find((x) => x.userId === userId);
  if (p) Object.assign(p, { displayName: 'Deleted user', username: `deleted_${userId.slice(-6)}`, bio: '', avatar: undefined, avatarThumb: undefined, isPublic: false, wishlistVisibility: 'private' });
  for (const pr of db.products) if (pr.sellerId === userId && pr.status === 'active') pr.status = 'removed';
  log(admin.id, 'user.delete', userId);
  commit();
}

export function setRole(userId: ID, role: Role, on: boolean) {
  const admin = requireAdmin();
  const u = find(getDb().users, (x) => x.id === userId, 'User');
  assert(!(userId === admin.id && role === 'admin' && !on), 'invalid', "You can't remove your own admin role");
  if (on && !u.roles.includes(role)) u.roles.push(role);
  if (!on) u.roles = u.roles.filter((r) => r !== role);
  if (role === 'admin' && on) notify(userId, 'security', 'You are now a Hayve admin', 'Verify your email and turn on two-step verification to open the admin panel.', '/admin');
  log(admin.id, `role.${on ? 'grant' : 'revoke'}.${role}`, userId);
  commit();
}

export function removeAvatar(userId: ID) {
  const admin = requireAdmin();
  const p = find(getDb().profiles, (x) => x.userId === userId, 'Profile');
  p.avatar = undefined;
  p.avatarThumb = undefined;
  notify(userId, 'security', 'Profile picture removed', 'Your profile picture was removed because it breaks the Hayve community rules.', '/settings/profile');
  log(admin.id, 'moderation.remove_avatar', userId);
  commit();
}

export function removeBio(userId: ID) {
  const admin = requireAdmin();
  const p = find(getDb().profiles, (x) => x.userId === userId, 'Profile');
  p.bio = '';
  notify(userId, 'security', 'Bio removed', 'Your bio was removed because it breaks the Hayve community rules.', '/settings/profile');
  log(admin.id, 'moderation.remove_bio', userId);
  commit();
}

/* ---------------------------------------------------------- moderation -- */

export function listings(q = '') {
  requireAdmin();
  const db = getDb();
  const term = q.trim().toLowerCase();
  return db.products
    .map((p) => ({ id: p.id, title: p.title, image: p.images[0], priceCents: p.priceCents, status: p.status, seller: displayName(p.sellerId), createdAt: p.createdAt }))
    .filter((p) => !term || `${p.title} ${p.seller}`.toLowerCase().includes(term))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function moderateListing(id: ID, action: 'remove' | 'restore') {
  const admin = requireAdmin();
  const p = find(getDb().products, (x) => x.id === id, 'Listing');
  p.status = action === 'remove' ? 'removed' : p.quantity > 0 ? 'active' : 'sold_out';
  if (action === 'remove') notify(p.sellerId, 'security', 'Listing removed', `"${p.title}" was removed because it breaks the Hayve rules.`);
  log(admin.id, `moderation.listing_${action}`, id);
  commit();
}

export function reviews(q = '') {
  requireAdmin();
  const db = getDb();
  const term = q.trim().toLowerCase();
  return db.reviews
    .filter((r) => r.text)
    .map((r) => ({ id: r.id, author: displayName(r.authorId), target: r.targetKind === 'user' ? displayName(r.targetId) : r.targetKind, rating: r.rating, text: r.text, createdAt: r.createdAt }))
    .filter((r) => !term || `${r.text} ${r.author} ${r.target}`.toLowerCase().includes(term))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);
}

export function removeReview(id: ID) {
  const admin = requireAdmin();
  const db = getDb();
  find(db.reviews, (r) => r.id === id, 'Review');
  db.reviews = db.reviews.filter((r) => r.id !== id);
  for (const o of db.orders) if (o.reviewId === id) o.reviewId = undefined;
  log(admin.id, 'moderation.remove_review', id);
  commit();
}

export function reports() {
  requireAdmin();
  const db = getDb();
  return db.reports
    .map((r) => {
      let target = r.targetId;
      if (r.targetKind === 'listing') target = db.products.find((p) => p.id === r.targetId)?.title ?? 'Removed listing';
      if (r.targetKind === 'user') target = displayName(r.targetId);
      if (r.targetKind === 'review') target = db.reviews.find((x) => x.id === r.targetId)?.text.slice(0, 60) ?? 'Removed review';
      return { ...r, reporter: displayName(r.reporterId), target };
    })
    .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || b.createdAt - a.createdAt);
}

/** Resolve a report, optionally taking the matching action in the same step. */
export function resolveReport(id: ID, outcome: 'remove_content' | 'dismiss', note = '') {
  const admin = requireAdmin();
  const db = getDb();
  const r = find(db.reports, (x) => x.id === id, 'Report');
  assert(r.status === 'open', 'conflict', 'This report was already handled');
  if (outcome === 'remove_content') {
    if (r.targetKind === 'listing') moderateListing(r.targetId, 'remove');
    if (r.targetKind === 'review') removeReview(r.targetId);
    if (r.targetKind === 'user') {
      removeAvatar(r.targetId);
      removeBio(r.targetId);
    }
  }
  r.status = outcome === 'dismiss' ? 'dismissed' : 'resolved';
  r.resolution = note.trim() || (outcome === 'dismiss' ? 'No rule broken' : 'Content removed');
  r.resolvedBy = admin.id;
  notify(r.reporterId, 'security', 'Your report was reviewed', outcome === 'dismiss' ? 'We reviewed it and found no rule was broken.' : 'Thanks — we removed the reported content.');
  log(admin.id, `report.${r.status}`, id);
  commit();
}

/* ------------------------------------------------------- verifications -- */

export function verifications() {
  requireAdmin();
  const db = getDb();
  return db.businesses
    .map((b) => ({ ...b, owner: publicUser(b.ownerId), ownerEmail: db.users.find((u) => u.id === b.ownerId)?.email ?? '' }))
    .sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || b.submittedAt - a.submittedAt);
}

export function reviewBusiness(id: ID, decision: 'approve' | 'reject', reason = '') {
  const admin = requireAdmin();
  const db = getDb();
  const b = find(db.businesses, (x) => x.id === id, 'Business');
  assert(b.status === 'pending', 'conflict', 'This application was already reviewed');
  if (decision === 'reject') assert(reason.trim().length >= 5, 'invalid', 'Give the applicant a clear reason');
  b.status = decision === 'approve' ? 'verified' : 'rejected';
  b.rejectionReason = decision === 'reject' ? reason.trim() : undefined;
  b.reviewedAt = now();
  b.reviewedBy = admin.id;
  const owner = find(db.users, (u) => u.id === b.ownerId, 'User');
  if (decision === 'approve') {
    for (const role of ['merchant', 'seller'] as const) if (!owner.roles.includes(role)) owner.roles.push(role);
    notify(owner.id, 'business', 'Your business is verified', `${b.tradingName} now shows the verified check mark on Hayve Store.`, '/business/merchant');
  } else {
    notify(owner.id, 'business', 'Application not approved', reason.trim(), '/business/merchant');
  }
  log(admin.id, `store.${decision}`, `${id}${reason ? `: ${reason.trim()}` : ''}`);
  commit();
}

/* ------------------------------------------------------------ settings -- */

export function getSettings() {
  requireAdmin();
  const s = settings();
  return { feeTiers: s.feeTiers, waveBack: s.waveBack, defaults: { feeTiers: DEFAULT_FEE_TIERS, waveBack: DEFAULT_WAVE_BACK } };
}

export function updateFeeTiers(tiers: FeeTier[]) {
  const admin = requireAdmin();
  assert(tiers.length >= 1 && tiers.length <= 8, 'invalid', 'Use 1 to 8 tiers');
  assert(tiers.every((t) => t.rate >= 0 && t.rate <= 0.3), 'invalid', 'Rates must be between 0 and 30%');
  const bounded = tiers.filter((t) => t.upToCents != null);
  assert(tiers.filter((t) => t.upToCents == null).length === 1, 'invalid', 'Exactly one tier must be "and above"');
  assert(bounded.every((t, i) => i === 0 || (t.upToCents ?? 0) > (bounded[i - 1].upToCents ?? 0)), 'invalid', 'Tier limits must increase');
  settings().feeTiers = tiers.map((t) => ({ upToCents: t.upToCents, rate: Math.round(t.rate * 10000) / 10000 }));
  log(admin.id, 'settings.fee_tiers', JSON.stringify(settings().feeTiers));
  commit();
}

export function updateWaveBack(patch: Partial<WaveBackSettings>) {
  const admin = requireAdmin();
  const next = { ...settings().waveBack, ...patch };
  const rates = [next.shopRate, next.servicesRate, next.newUserRate];
  assert(rates.every((r) => r >= 0 && r <= 0.2), 'invalid', 'Rates must be between 0 and 20%');
  assert([next.shopMaxPerPurchaseCents, next.newUserMaxTotalCents, next.monthlyMaxCents].every((c) => Number.isInteger(c) && c >= 0), 'invalid', 'Caps must be whole cents');
  assert(next.newUserDays >= 0 && next.newUserDays <= 365, 'invalid', 'Welcome period must be 0–365 days');
  settings().waveBack = next;
  log(admin.id, 'settings.wave_back', JSON.stringify(next));
  commit();
}

/** Preview of the buyer fee at a few prices, so admins see the effect of their tiers. */
export function feePreview(tiers: FeeTier[]) {
  return [1000, 5000, 5001, 25000, 26000, 100000, 101000, 250000].map((p) => ({ priceCents: p, feeCents: marketplaceFeeCents(p, tiers) }));
}

/* --------------------------------------------------------------- audit -- */

export function auditLog() {
  requireAdmin();
  const db = getDb();
  return db.audit
    .slice(-300)
    .reverse()
    .map((a) => ({ ...a, actor: a.actorId ? displayName(a.actorId) : 'system' }));
}

/** Orders (gift purchasers stay sealed even for admins). */
export function orders() {
  requireAdmin();
  const db = getDb();
  return db.orders
    .map((o) => ({
      id: o.id,
      reference: o.reference,
      kind: o.kind,
      product: db.products.find((p) => p.id === o.productId)?.title ?? '—',
      seller: displayName(o.sellerId),
      buyer: o.kind === 'gift' ? 'Sealed (anonymous gift)' : displayName(o.buyerId!),
      totalCents: o.totalCents,
      feeCents: o.feeCents,
      status: o.status,
      createdAt: o.createdAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function assertNotSelf(id: ID, adminId: ID) {
  if (id === adminId) throw new HayveError('invalid', 'Not allowed on your own account');
}
