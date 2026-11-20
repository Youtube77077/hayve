import type { Database, ID } from './types';

/**
 * The local simulated backend.
 *
 * All data lives in a single in-memory `Database` that is persisted through a
 * pluggable `StorageAdapter` (AsyncStorage on device / localStorage on web /
 * memory in tests). UI code never touches this module directly: it calls the
 * functions in `src/backend/api`, which enforce permissions and shape the data
 * each viewer is allowed to see — exactly the role the Supabase RLS policies and
 * RPC functions play in production.
 */

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export type HayveErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'unauthenticated'
  | 'invalid'
  | 'conflict'
  | 'insufficient_funds'
  | 'payment_failed';

export class HayveError extends Error {
  constructor(
    public code: HayveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HayveError';
  }
}

export const DB_KEY = 'hayve.db.v3';
export const SESSION_KEY = 'hayve.session.v1';

let db: Database | null = null;
let storage: StorageAdapter | null = null;
let version = 0;
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function attachStorage(adapter: StorageAdapter | null) {
  storage = adapter;
}

export function setDatabase(next: Database) {
  db = next;
  version++;
  listeners.forEach((l) => l());
}

export function getDb(): Database {
  if (!db) throw new Error('Hayve database not initialised');
  return db;
}

export function isReady() {
  return db !== null;
}

/** Call after every mutation. Notifies subscribers and schedules persistence. */
export function commit() {
  version++;
  listeners.forEach((l) => l());
  if (!storage) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void storage?.setItem(DB_KEY, JSON.stringify(db));
  }, 120);
}

/** Re-renders screens without saving (for example after exchange rates or the currency change). */
export function refresh() {
  version++;
  listeners.forEach((l) => l());
}

export async function flush() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (storage && db) await storage.setItem(DB_KEY, JSON.stringify(db));
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion() {
  return version;
}

export function getStorage() {
  return storage;
}

/* ---------------------------------------------------------------- utils -- */

let counter = 0;
export function uid(prefix: string): ID {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function reference(prefix: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${s}`;
}

export const now = () => Date.now();

export function find<T>(rows: T[], pred: (r: T) => boolean, what: string): T {
  const row = rows.find(pred);
  if (!row) throw new HayveError('not_found', `${what} not found`);
  return row;
}

export function assert(cond: unknown, code: HayveErrorCode, message: string): asserts cond {
  if (!cond) throw new HayveError(code, message);
}

/** Tiny non-cryptographic hash used ONLY by the offline simulation. Supabase Auth replaces this. */
export function simHash(input: string) {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `sim$${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
