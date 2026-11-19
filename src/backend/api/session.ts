import { ensureAccount } from '../ledger';
import { defaultProfile } from '../seed';
import { assert, commit, getDb, getStorage, HayveError, now, SESSION_KEY, simHash, uid } from '../store';
import type { ID, Role, User } from '../types';

/**
 * Authentication (simulated). The production adapter swaps these for Supabase
 * Auth (`supabase.auth.signUp`, `signInWithPassword`, `resetPasswordForEmail`).
 */

let currentUserId: ID | null = null;
const sessionListeners = new Set<() => void>();

export function getSessionUserId() {
  return currentUserId;
}

export function onSessionChange(fn: () => void) {
  sessionListeners.add(fn);
  return () => {
    sessionListeners.delete(fn);
  };
}

function setSession(id: ID | null) {
  currentUserId = id;
  const storage = getStorage();
  if (storage) {
    if (id) void storage.setItem(SESSION_KEY, id);
    else void storage.deleteItem(SESSION_KEY);
  }
  sessionListeners.forEach((l) => l());
}

export function restoreSession(id: ID | null) {
  const db = getDb();
  currentUserId = id && db.users.some((u) => u.id === id && !u.deletedAt) ? id : null;
}

/** The authenticated caller. Every protected API function starts here. */
export function me(): User {
  if (!currentUserId) throw new HayveError('unauthenticated', 'Please sign in to continue');
  const user = getDb().users.find((u) => u.id === currentUserId && !u.deletedAt);
  if (!user) throw new HayveError('unauthenticated', 'Please sign in to continue');
  return user;
}

export function hasRole(user: User, role: Role) {
  return user.roles.includes(role);
}

export function requireRole(role: Role) {
  const user = me();
  if (!hasRole(user, role)) throw new HayveError('forbidden', 'You do not have access to this area');
  return user;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

export function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  username: string;
  accountType?: 'individual' | 'business';
}) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  assert(EMAIL_RE.test(email), 'invalid', 'Enter a valid email address');
  assert(input.password.length >= 8, 'invalid', 'Password must be at least 8 characters');
  assert(input.displayName.trim().length >= 2, 'invalid', 'Enter your name');
  assert(USERNAME_RE.test(username), 'invalid', 'Username: 3–20 lowercase letters, numbers, dots or underscores');
  assert(!db.users.some((u) => u.email === email && !u.deletedAt), 'conflict', 'An account with this email already exists');
  assert(!db.profiles.some((p) => p.username === username), 'conflict', 'That username is taken');

  const user: User = {
    id: uid('u'),
    email,
    passwordHash: simHash(input.password),
    roles: ['customer'],
    emailVerified: false,
    createdAt: now(),
  };
  db.users.push(user);
  db.profiles.push({ ...defaultProfile(user.id, username, input.displayName.trim()), accountType: input.accountType ?? 'individual' });
  ensureAccount(user.id);
  db.notifications.push({
    id: uid('n'),
    userId: user.id,
    kind: 'security',
    title: 'Welcome to Hayve',
    body: 'One account, one wallet. Verify your email to unlock payouts.',
    read: false,
    createdAt: now(),
    link: '/settings',
  });
  commit();
  setSession(user.id);
  return user;
}

export function signIn(emailRaw: string, password: string) {
  const db = getDb();
  const email = emailRaw.trim().toLowerCase();
  const user = db.users.find((u) => u.email === email && !u.deletedAt);
  if (!user || user.passwordHash !== simHash(password)) {
    throw new HayveError('unauthenticated', 'Email or password is incorrect');
  }
  setSession(user.id);
  return user;
}

export function signOut() {
  setSession(null);
}

export function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  assert(EMAIL_RE.test(email), 'invalid', 'Enter a valid email address');
  // Always succeed, so the endpoint cannot be used to discover registered emails.
  return { sent: true as const };
}

export function resetPassword(emailRaw: string, code: string, newPassword: string) {
  const db = getDb();
  assert(code.trim() === '246810', 'invalid', 'That code is not valid. (Simulation code: 246810)');
  assert(newPassword.length >= 8, 'invalid', 'Password must be at least 8 characters');
  const user = db.users.find((u) => u.email === emailRaw.trim().toLowerCase() && !u.deletedAt);
  if (user) {
    user.passwordHash = simHash(newPassword);
    commit();
  }
  return { ok: true as const };
}

export function verifyEmail(code: string) {
  const user = me();
  assert(code.trim() === '246810', 'invalid', 'That code is not valid. (Simulation code: 246810)');
  user.emailVerified = true;
  commit();
}

export function changePassword(current: string, next: string) {
  const user = me();
  assert(user.passwordHash === simHash(current), 'invalid', 'Current password is incorrect');
  assert(next.length >= 8, 'invalid', 'New password must be at least 8 characters');
  user.passwordHash = simHash(next);
  getDb().notifications.push({ id: uid('n'), userId: user.id, kind: 'security', title: 'Password changed', body: 'Your Hayve password was changed.', read: false, createdAt: now() });
  commit();
}

export function deleteAccount(password: string) {
  const user = me();
  assert(user.passwordHash === simHash(password), 'invalid', 'Password is incorrect');
  const db = getDb();
  user.deletedAt = now();
  user.email = `deleted+${user.id}@hayve.invalid`;
  const profile = db.profiles.find((p) => p.userId === user.id);
  if (profile) {
    profile.displayName = 'Deleted user';
    profile.username = `deleted_${user.id.slice(-6)}`;
    profile.bio = '';
    profile.avatar = undefined;
    profile.isPublic = false;
    profile.wishlistPublic = false;
  }
  for (const p of db.products) if (p.sellerId === user.id && p.status === 'active') p.status = 'removed';
  db.wishlistItems = db.wishlistItems.filter((w) => w.ownerId !== user.id || w.status === 'sold');
  commit();
  setSession(null);
}

/** Development helper: switch between seeded demo users to test multi-user flows. */
export function switchDemoUser(email: string) {
  const user = getDb().users.find((u) => u.email === email && !u.deletedAt);
  if (!user) throw new HayveError('not_found', 'Demo account not found');
  setSession(user.id);
  return user;
}
