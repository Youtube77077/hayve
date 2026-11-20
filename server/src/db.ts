import pg from 'pg';
import type { Config } from './config.js';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(c: Config): Db {
  return new pg.Pool({
    connectionString: c.DATABASE_URL,
    ssl: c.DATABASE_SSL === 'disable' ? false : c.DATABASE_CA_CERT ? { ca: c.DATABASE_CA_CERT, rejectUnauthorized: true } : c.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    max: 10,
  });
}

export interface Actor {
  userId: string | null;
  /** 'aal2' after a second factor in this session (required for admin access). */
  aal: 'aal1' | 'aal2';
}

/**
 * Runs `fn` in a transaction as the given user, with row level security enforced:
 * the role is switched to `authenticated`/`anon` and auth.uid() / aal are set for
 * this transaction only. The API never bypasses RLS for user requests.
 */
export async function asUser<T>(db: Db, actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('begin');
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.aal', $2, true)`, [actor.userId ?? '', actor.aal]);
    await tx.query(actor.userId ? 'set local role authenticated' : 'set local role anon');
    const out = await fn(tx);
    await tx.query('commit');
    return out;
  } catch (e) {
    await tx.query('rollback').catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
}

/** Privileged transaction for auth bookkeeping only (sign-up, password hashes, TOTP secrets). */
export async function asSystem<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('begin');
    const out = await fn(tx);
    await tx.query('commit');
    return out;
  } catch (e) {
    await tx.query('rollback').catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
}
