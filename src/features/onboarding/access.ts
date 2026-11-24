/**
 * Which pages someone without an account can open. Public pages and shared links always;
 * after onboarding they can also look around every service. Paying, booking and selling ask
 * them to save their setup (see useAction in lib/hooks.ts).
 */
export const PUBLIC_ROOTS = new Set(['(auth)', 'u', 'product', 'paylink', 'track', 'privacy', 'claim', 'r', 'start']);
const GUEST_ROOTS = new Set(['bites', 'stay', 'drive', 'sell', 'services']);
const GUEST_TABS = new Set(['index', 'explore', 'shop', 'ride', 'bites', 'drive', 'stay']);
/** Pages under a guest root that still need an account (orders and bookings). */
const ACCOUNT_ONLY = /^\/(bites\/order|stay\/booking|drive\/booking)\//;

export function guestCanOpen(segments: string[], pathname: string) {
  const [root, sub] = segments;
  if (!root) return true;
  if (PUBLIC_ROOTS.has(root)) return true;
  if (ACCOUNT_ONLY.test(pathname)) return false;
  if (root === '(tabs)') return GUEST_TABS.has(sub ?? 'index');
  return GUEST_ROOTS.has(root);
}
