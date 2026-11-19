import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { CartLine } from '../backend/api/bites';

const KEY = 'hayve.cart.v1';

/** Hayve Bites basket: one restaurant at a time, persisted on the device. */
interface CartState {
  restaurantId: string | null;
  lines: CartLine[];
}
let state: CartState = { restaurantId: null, lines: [] };
const listeners = new Set<() => void>();
const emit = () => {
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
};

/** Restores the basket after an app restart or page refresh. */
export async function hydrateCart() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      state = JSON.parse(raw) as CartState;
      listeners.forEach((l) => l());
    }
  } catch {}
}

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
