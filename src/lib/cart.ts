import { useSyncExternalStore } from 'react';
import type { CartLine } from '../backend/api/bites';

/** Hayve Bites basket: one restaurant at a time, kept in memory for the session. */
interface CartState {
  restaurantId: string | null;
  lines: CartLine[];
}
let state: CartState = { restaurantId: null, lines: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const cart = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  add(restaurantId: string, menuItemId: string, options: string[], qty = 1) {
    const base = state.restaurantId === restaurantId ? state.lines : [];
    const key = `${menuItemId}|${options.join(',')}`;
    const existing = base.find((l) => l.key === key);
    const lines = existing ? base.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...base, { key, menuItemId, options, qty }];
    state = { restaurantId, lines };
    emit();
  },
  setQty(key: string, qty: number) {
    const lines = qty <= 0 ? state.lines.filter((l) => l.key !== key) : state.lines.map((l) => (l.key === key ? { ...l, qty } : l));
    state = { restaurantId: lines.length ? state.restaurantId : null, lines };
    emit();
  },
  clear() {
    state = { restaurantId: null, lines: [] };
    emit();
  },
  count: () => state.lines.reduce((s, l) => s + l.qty, 0),
};

export function useCart() {
  return useSyncExternalStore(cart.subscribe, cart.get, cart.get);
}
