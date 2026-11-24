import { DEFAULT_REGION, getGuestCountry, region, setDisplayCurrency } from '../regions';
import { OWNER_ADMIN_EMAILS, SIM_CODE } from '../config';
import { ensureAccount } from '../ledger';
import { defaultProfile } from '../seed';
import { assert, commit, getDb, getStorage, HayveError, now, SESSION_KEY, simHash, uid, refresh } from '../store';
import type { ID, Role, User, OnboardingPrefs } from '../types';

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

/** Money is shown in the signed-in person's currency (from their country). */
function syncCurrency() {
  const p = currentUserId ? getDb().profiles.find((x) => x.userId === currentUserId) : null;
  setDisplayCurrency(region(p ? p.country : getGuestCountry()).currency);
}

function setSession(id: ID | null) {
  currentUserId = id;
  syncCurrency();
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
  syncCurrency();
}

/** Re-reads the currency after the person changes their country. */
export function refreshCurrency() {
  syncCurrency();
  refresh();
  sessionListeners.forEach((l) => l());
}

/** The authenticated caller. Every protected API function starts here. */
export function me(): User {
  if (!currentUserId) throw new HayveError('unauthenticated', 'Please sign in to continue');
  const user = getDb().users.find((u) => u.id === currentUserId && !u.deletedAt);
  if (!user) throw new HayveError('unauthenticated', 'Please sign in to continue');
  if (user.suspendedAt) throw new HayveError('forbidden', 'This account is suspended. Contact Hayve support.');
  return user;
}

/**
 * Admin tools require the admin role AND a verified email AND two-step
 * verification. (In PostgreSQL the same rule is enforced via the aal2 claim.)
 */
export function requireAdmin() {
  const user = requireRole('admin');
  const profile = getDb().profiles.find((p) => p.userId === user.id);
  if (!user.emailVerified || !profile?.twoFactor) {
    throw new HayveError('forbidden', 'Verify your email and turn on two-step verification to use admin tools.');
  }
  return user;
}

export function adminSetupStatus() {
  const user = me();
  const profile = getDb().profiles.find((p) => p.userId === user.id);
  return { isAdmin: user.roles.includes('admin'), emailVerified: user.emailVerified, twoFactor: !!profile?.twoFactor };
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

const GOALS = ['ride', 'food', 'shop', 'sell', 'stay', 'car', 'money', 'holiday'] as const;
const COMPANY = ['solo', 'partner', 'family', 'friends'] as const;
const EARN = ['seller', 'driver', 'courier', 'host', 'car_owner'] as const;
const CATS = ['fashion', 'electronics', 'home', 'accessories', 'collectibles', 'books', 'sport', 'general'] as const;
const RIDES = ['go', 'green', 'comfort', 'xl', 'priority'] as const;
const CARS = ['compact', 'sedan', 'suv', 'electric', 'van', 'luxury'] as const;

/** Keeps only known onboarding answers (they come from the device). */
export function cleanPrefs(p: OnboardingPrefs): OnboardingPrefs {
  const inList = <T extends string>(v: unknown, list: readonly T[]): v is T => list.includes(v as T);
  const arr = <T extends string>(v: unknown, list: readonly T[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => inList(x, list)))].slice(0, 8) : undefined);
  const out: OnboardingPrefs = {};
  if (inList(p.goal, GOALS)) out.goal = p.goal;
  const interests = arr(p.interests, GOALS);
  if (interests) out.interests = interests;
  if (inList(p.primary, GOALS)) out.primary = p.primary;
  if (inList(p.company, COMPANY)) out.company = p.company;
  if (Array.isArray(p.cuisines)) out.cuisines = p.cuisines.filter((c) => typeof c === 'string' && c.length <= 30).slice(0, 8);
  const shop = arr(p.shopFor, CATS);
  if (shop) out.shopFor = shop;
  if (inList(p.rideType, RIDES)) out.rideType = p.rideType;
  if (typeof p.travellers === 'number' && p.travellers >= 1 && p.travellers <= 16) out.travellers = Math.round(p.travellers);
  if (inList(p.carType, CARS)) out.carType = p.carType;
  const earn = arr(p.earn, EARN);
  if (earn) out.earn = earn;
  return out;
}

/** The signed-in person's onboarding answers (null when signed out or never answered). */
export function myPreferences(): OnboardingPrefs | null {
  if (!currentUserId) return null;
  return getDb().profiles.find((p) => p.userId === currentUserId)?.onboarding ?? null;
}

/** Saves new onboarding answers for a signed-in person (redoing onboarding from Settings). */
export function savePreferences(prefs: OnboardingPrefs) {
  const user = me();
  const p = getDb().profiles.find((x) => x.userId === user.id);
  assert(p, 'not_found', 'Profile not found');
  p.onboarding = cleanPrefs(prefs);
  commit();
}

export function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  username: string;
  accountType?: 'individual' | 'business';
  /** ISO country code; defaults to where the device is (IP address), else the United States. */
  country?: string;
  /** App language (defaults to the device language). */
  language?: 'en' | 'es' | 'fr' | 'de' | 'nl';
  /** Home address (prefilled from the device location, checked by the person). */
  address?: { line1: string; city: string; postcode: string; country: string };
  /** Answers from onboarding before sign-up (kept to personalise the app). */
  onboarding?: OnboardingPrefs;
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
    // The owner account is granted admin on registration. Other admins can only be added by an admin.
    roles: OWNER_ADMIN_EMAILS.includes(email) ? ['customer', 'admin'] : ['customer'],
    emailVerified: false,
    createdAt: now(),
  };
  db.users.push(user);
  const reg = region(input.country ?? getGuestCountry() ?? DEFAULT_REGION);
  db.profiles.push({ ...defaultProfile(user.id, username, input.displayName.trim()), accountType: input.accountType ?? 'individual', country: reg.code, currency: reg.currency, city: reg.city.name, language: input.language ?? 'en' });
  ensureAccount(user.id);
  if (input.onboarding) {
    const p = db.profiles.find((x) => x.userId === user.id);
    if (p) p.onboarding = cleanPrefs(input.onboarding);
  }
  const a = input.address;
  if (a && a.line1.trim().length >= 3 && a.city.trim().length >= 2) {
    db.addresses.push({ id: uid('ad'), userId: user.id, label: 'Home', fullName: input.displayName.trim(), line1: a.line1.trim().slice(0, 120), city: a.city.trim().slice(0, 80), postcode: a.postcode.trim().slice(0, 16), country: a.country.trim() || reg.name, isDefault: true });
    const p = db.profiles.find((x) => x.userId === user.id);
    if (p) p.city = a.city.trim().slice(0, 80);
  }
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
  if (user.suspendedAt) throw new HayveError('forbidden', 'This account is suspended. Contact Hayve support.');
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
  assert(code.trim() === SIM_CODE, 'invalid', `That code is not valid. (Preview code: ${SIM_CODE})`);
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
  assert(code.trim() === SIM_CODE, 'invalid', `That code is not valid. (Preview code: ${SIM_CODE})`);
  user.emailVerified = true;
  commit();
}

/** Turns on two-step verification after confirming an authenticator code. */
export function enableTwoFactor(code: string) {
  const user = me();
  assert(code.trim() === SIM_CODE, 'invalid', `That code is not valid. (Preview code: ${SIM_CODE})`);
  const p = getDb().profiles.find((x) => x.userId === user.id);
  if (p) p.twoFactor = true;
  getDb().notifications.push({ id: uid('n'), userId: user.id, kind: 'security', title: 'Two-step verification on', body: 'Your account now asks for a code on new devices.', read: false, createdAt: now() });
  commit();
}

export function disableTwoFactor(password: string) {
  const user = me();
  assert(user.passwordHash === simHash(password), 'invalid', 'Password is incorrect');
  const p = getDb().profiles.find((x) => x.userId === user.id);
  if (p) p.twoFactor = false;
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
    profile.wishlistVisibility = 'private';
    profile.avatarThumb = undefined;
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
