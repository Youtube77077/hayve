import { assert, commit, find, getDb, HayveError, now, uid } from '../store';
import type { Address, ID, NotificationKind, Profile, Thread } from '../types';
import { displayName, notify, publicUser, type PublicUser } from './common';
import { ratingFor, toCard } from './shop';
import { getSessionUserId, me } from './session';

/* ------------------------------------------------------------ Profiles -- */

export function myProfile() {
  const user = me();
  const db = getDb();
  const profile = find(db.profiles, (p) => p.userId === user.id, 'Profile');
  return { user: { id: user.id, email: user.email, roles: user.roles, emailVerified: user.emailVerified, createdAt: user.createdAt }, profile };
}

export function updateProfile(patch: Partial<Pick<Profile, 'displayName' | 'username' | 'bio' | 'avatar' | 'city' | 'isPublic' | 'wishlistPublic' | 'language' | 'twoFactor' | 'accountType'>>) {
  const user = me();
  const db = getDb();
  const p = find(db.profiles, (x) => x.userId === user.id, 'Profile');
  if (patch.username != null) {
    const u = patch.username.trim().toLowerCase();
    assert(/^[a-z0-9._]{3,20}$/.test(u), 'invalid', 'Username: 3–20 lowercase letters, numbers, dots or underscores');
    assert(!db.profiles.some((x) => x.username === u && x.userId !== user.id), 'conflict', 'That username is taken');
    patch.username = u;
  }
  if (patch.displayName != null) {
    assert(patch.displayName.trim().length >= 2, 'invalid', 'Enter your name');
    patch.displayName = patch.displayName.trim();
  }
  if (patch.bio != null) assert(patch.bio.length <= 240, 'invalid', 'Bio can be up to 240 characters');
  Object.assign(p, patch);
  commit();
}

export function setNotificationPref(kind: NotificationKind, on: boolean) {
  const user = me();
  const p = find(getDb().profiles, (x) => x.userId === user.id, 'Profile');
  p.notificationPrefs[kind] = on;
  commit();
}

export interface PublicProfileView {
  user: PublicUser;
  bio: string;
  memberSince: number;
  accountType: Profile['accountType'];
  isMe: boolean;
  visible: boolean;
  rating: { average: number; count: number };
  reviews: { id: ID; author: string; avatar?: string; rating: number; text: string; createdAt: number }[];
  listings: ReturnType<typeof toCard>[];
  soldCount: number;
  wishlistPublic: boolean;
  roles: { seller: boolean; host: boolean; kitchen: boolean };
}

export function getPublicProfile(username: string): PublicProfileView {
  const db = getDb();
  const p = find(db.profiles, (x) => x.username === username.toLowerCase().replace(/^@/, ''), 'Profile');
  const user = db.users.find((u) => u.id === p.userId);
  if (!user || user.deletedAt) throw new HayveError('not_found', 'Profile not found');
  const viewer = getSessionUserId();
  const isMe = viewer === p.userId;
  const visible = isMe || p.isPublic;
  return {
    user: publicUser(p.userId),
    bio: visible ? p.bio : '',
    memberSince: user.createdAt,
    accountType: p.accountType,
    isMe,
    visible,
    rating: ratingFor('user', p.userId),
    reviews: visible
      ? db.reviews
          .filter((r) => r.targetKind === 'user' && r.targetId === p.userId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => ({ id: r.id, author: displayName(r.authorId), avatar: publicUser(r.authorId).avatar, rating: r.rating, text: r.text, createdAt: r.createdAt }))
      : [],
    listings: visible ? db.products.filter((x) => x.sellerId === p.userId && x.status === 'active' && x.quantity > 0).map(toCard) : [],
    soldCount: db.orders.filter((o) => o.sellerId === p.userId && o.status !== 'refunded').length,
    wishlistPublic: visible && p.wishlistPublic,
    roles: { seller: user.roles.includes('seller'), host: user.roles.includes('host'), kitchen: user.roles.includes('kitchen') },
  };
}

export function addresses(): Address[] {
  const user = me();
  return getDb().addresses.filter((a) => a.userId === user.id);
}

export function saveAddress(input: Omit<Address, 'id' | 'userId' | 'isDefault'> & { id?: ID; isDefault?: boolean }) {
  const user = me();
  const db = getDb();
  assert(input.fullName.trim().length >= 2, 'invalid', 'Enter the full name');
  assert(input.line1.trim().length >= 4, 'invalid', 'Enter the street address');
  assert(input.city.trim().length >= 2, 'invalid', 'Enter the city');
  assert(input.postcode.trim().length >= 4, 'invalid', 'Enter the postcode');
  const mine = db.addresses.filter((a) => a.userId === user.id);
  const makeDefault = input.isDefault || mine.length === 0;
  if (makeDefault) mine.forEach((a) => (a.isDefault = false));
  if (input.id) {
    const a = find(db.addresses, (x) => x.id === input.id && x.userId === user.id, 'Address');
    Object.assign(a, { ...input, isDefault: makeDefault || a.isDefault });
  } else {
    db.addresses.push({ ...input, id: uid('ad'), userId: user.id, isDefault: makeDefault, label: input.label || 'Home' });
  }
  commit();
}

export function deleteAddress(id: ID) {
  const user = me();
  const db = getDb();
  const a = find(db.addresses, (x) => x.id === id && x.userId === user.id, 'Address');
  db.addresses = db.addresses.filter((x) => x.id !== id);
  if (a.isDefault) {
    const next = db.addresses.find((x) => x.userId === user.id);
    if (next) next.isDefault = true;
  }
  commit();
}

/* ------------------------------------------------------------ Messages -- */

export interface ThreadView {
  id: ID;
  other: PublicUser;
  context?: Thread['context'];
  lastMessage?: { body: string; createdAt: number; mine: boolean };
  unread: number;
  lastMessageAt: number;
}

export function threads(): ThreadView[] {
  const user = me();
  const db = getDb();
  return db.threads
    .filter((t) => t.participantIds.includes(user.id))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    .map((t) => {
      const msgs = db.messages.filter((m) => m.threadId === t.id);
      const last = msgs[msgs.length - 1];
      const otherId = t.participantIds.find((p) => p !== user.id) ?? user.id;
      return {
        id: t.id,
        other: publicUser(otherId),
        context: t.context,
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, mine: last.senderId === user.id } : undefined,
        unread: msgs.filter((m) => !m.readBy.includes(user.id)).length,
        lastMessageAt: t.lastMessageAt,
      };
    });
}

export function unreadMessageCount() {
  const id = getSessionUserId();
  if (!id) return 0;
  const db = getDb();
  const mine = new Set(db.threads.filter((t) => t.participantIds.includes(id)).map((t) => t.id));
  return db.messages.filter((m) => mine.has(m.threadId) && !m.readBy.includes(id)).length;
}

export function thread(id: ID) {
  const user = me();
  const db = getDb();
  const t = find(db.threads, (x) => x.id === id && x.participantIds.includes(user.id), 'Conversation');
  const otherId = t.participantIds.find((p) => p !== user.id) ?? user.id;
  return {
    id: t.id,
    other: publicUser(otherId),
    context: t.context,
    messages: db.messages.filter((m) => m.threadId === id).map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, mine: m.senderId === user.id, read: m.readBy.length > 1 })),
  };
}

export function markThreadRead(id: ID) {
  const user = me();
  const db = getDb();
  let changed = false;
  for (const m of db.messages) {
    if (m.threadId === id && !m.readBy.includes(user.id)) {
      m.readBy.push(user.id);
      changed = true;
    }
  }
  if (changed) commit();
}

export function startThread(otherUserId: ID, context?: Thread['context']) {
  const user = me();
  const db = getDb();
  assert(otherUserId !== user.id, 'invalid', "You can't message yourself");
  find(db.users, (u) => u.id === otherUserId && !u.deletedAt, 'User');
  let t = db.threads.find((x) => x.participantIds.includes(user.id) && x.participantIds.includes(otherUserId) && (context ? x.context?.id === context.id : !x.context));
  if (!t) {
    t = { id: uid('th'), participantIds: [user.id, otherUserId], context, lastMessageAt: now() };
    db.threads.push(t);
    commit();
  }
  return t.id;
}

export function sendMessage(threadId: ID, body: string) {
  const user = me();
  const db = getDb();
  const t = find(db.threads, (x) => x.id === threadId && x.participantIds.includes(user.id), 'Conversation');
  const text = body.trim();
  assert(text.length > 0, 'invalid', 'Message is empty');
  assert(text.length <= 2000, 'invalid', 'Message is too long');
  db.messages.push({ id: uid('m'), threadId, senderId: user.id, body: text, createdAt: now(), readBy: [user.id] });
  t.lastMessageAt = now();
  for (const p of t.participantIds) if (p !== user.id) notify(p, 'message', `New message from ${displayName(user.id)}`, text.slice(0, 90), `/messages/${threadId}`);
  commit();
}

/* ------------------------------------------------------- Notifications -- */

export function notifications() {
  const user = me();
  return getDb()
    .notifications.filter((n) => n.userId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadNotificationCount() {
  const id = getSessionUserId();
  if (!id) return 0;
  return getDb().notifications.filter((n) => n.userId === id && !n.read).length;
}

export function markNotificationsRead(ids?: ID[]) {
  const user = me();
  for (const n of getDb().notifications) if (n.userId === user.id && (!ids || ids.includes(n.id))) n.read = true;
  commit();
}
