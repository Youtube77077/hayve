import * as OTPAuth from 'otpauth';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';

const url = inject('databaseUrl');
const run = url ? describe : describe.skip;

run('API against PostgreSQL (migrations + RLS)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let db: pg.Pool;
  beforeAll(async () => {
    const c = loadConfig({ DATABASE_URL: url, JWT_SECRET: 'test-secret-test-secret-test-secret-123', NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    db = createPool(c);
    app = await buildApp(c, db);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, token?: string, body?: object) => {
    const r = await app.inject({ method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body });
    return { status: r.statusCode, json: r.json() };
  };

  let owner = '';
  let secret = '';

  it('signs up the owner with the admin role, password hashed', async () => {
    const r = await call('POST', '/auth/sign-up', undefined, { email: 'RojyarZakholi@gmail.com', password: 'a strong passphrase 1', displayName: 'Owner', username: 'owner' });
    expect(r.status).toBe(200);
    owner = r.json.token;
    const row = (await db.query("select password_hash from auth.users where email = 'rojyarzakholi@gmail.com'")).rows[0];
    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
    const me = await call('GET', '/me', owner);
    expect(me.json.roles).toContain('admin');
  });

  it('blocks admin tools without email verification and 2FA', async () => {
    expect((await call('GET', '/admin/overview', owner)).status).toBe(403);
    const setup = await call('POST', '/auth/2fa/setup', owner);
    secret = setup.json.secret;
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    const en = await call('POST', '/auth/2fa/enable', owner, { code });
    expect(en.status).toBe(200);
    owner = en.json.token;
    const r = await call('GET', '/admin/overview', owner);
    expect(r.status).toBe(403);
    expect(r.json.message).toMatch(/Verify your email/);
  });

  it('allows admin tools after verification, logs actions', async () => {
    await db.query("update auth.users set email_verified_at = now() where email = 'rojyarzakholi@gmail.com'");
    const ov = await call('GET', '/admin/overview', owner);
    expect(ov.status).toBe(200);
    expect(ov.json.users).toBe(1);
    const fees = await call('PUT', '/admin/settings/fees', owner, { tiers: [{ upTo: 5000, rate: 0.05 }, { upTo: 25000, rate: 0.04 }, { upTo: 100000, rate: 0.03 }, { upTo: null, rate: 0.02 }] });
    expect(fees.status).toBe(200);
    const log = await call('GET', '/admin/audit', owner);
    expect(log.json[0].action).toBe('update_fee_tiers');
  });

  it('sign-in needs the 2FA code for this account', async () => {
    const first = await call('POST', '/auth/sign-in', undefined, { email: 'rojyarzakholi@gmail.com', password: 'a strong passphrase 1' });
    expect(first.json.needsCode).toBe(true);
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    const second = await call('POST', '/auth/sign-in', undefined, { email: 'rojyarzakholi@gmail.com', password: 'a strong passphrase 1', code });
    expect(second.status).toBe(200);
    expect((await call('POST', '/auth/sign-in', undefined, { email: 'rojyarzakholi@gmail.com', password: 'nope nope 1' })).status).toBe(401);
  });

  it('regular users cannot use admin tools or grant themselves admin', async () => {
    const r = await call('POST', '/auth/sign-up', undefined, { email: 'sam@test.dev', password: 'another passphrase 2', displayName: 'Sam', username: 'sam' });
    const sam = r.json.token;
    expect((await call('GET', '/admin/users', sam)).status).toBe(403);
    expect((await call('POST', '/admin/admins', sam, { userId: '00000000-0000-0000-0000-000000000000' })).status).toBe(403);
    const me = await call('GET', '/me', sam);
    expect(me.json.roles).not.toContain('admin');
  });

  it('enforces the 200 character bio and profile privacy settings', async () => {
    const r = await call('POST', '/auth/sign-in', undefined, { email: 'sam@test.dev', password: 'another passphrase 2' });
    const sam = r.json.token;
    expect((await call('PATCH', '/me/profile', sam, { bio: 'x'.repeat(201) })).status).toBe(400);
    const ok = await call('PATCH', '/me/profile', sam, { bio: 'Vintage cameras and good coffee.', wishlistVisibility: 'link' });
    expect(ok.json.wishlist_visibility).toBe('link');
  });

  it('suspends users and revokes their sessions', async () => {
    const sam = (await call('POST', '/auth/sign-in', undefined, { email: 'sam@test.dev', password: 'another passphrase 2' })).json.token;
    const users = await call('GET', '/admin/users?q=sam', owner);
    const id = users.json[0].id;
    expect((await call('POST', `/admin/users/${id}/suspend`, owner, { reason: 'Spam listings' })).status).toBe(200);
    expect((await call('GET', '/me', sam)).status).toBe(401);
  });

  it('exports and deletes personal data (GDPR)', async () => {
    const r = await call('POST', '/auth/sign-up', undefined, { email: 'gdpr@test.dev', password: 'privacy matters 3', displayName: 'Gee', username: 'gee' });
    const t = r.json.token;
    const ex = await call('GET', '/me/export', t);
    expect(ex.json.account.email).toBe('gdpr@test.dev');
    expect(ex.json.account.password_hash).toBeUndefined();
    expect((await call('DELETE', '/me', t, { password: 'privacy matters 3' })).status).toBe(200);
    expect((await call('POST', '/auth/sign-in', undefined, { email: 'gdpr@test.dev', password: 'privacy matters 3' })).status).toBe(401);
  });

  it('reports uploads as unavailable when storage is not configured', async () => {
    expect((await call('POST', '/me/avatar/upload-url', owner, { contentType: 'image/jpeg', size: 1000 })).status).toBe(503);
    expect((await call('POST', '/me/avatar/upload-url', owner, { contentType: 'image/gif', size: 1000 })).status).toBe(400);
  });
});

run('payments without a provider configured', () => {
  it('reports payments as unavailable instead of pretending to take money', async () => {
    const c = loadConfig({ DATABASE_URL: url, JWT_SECRET: 'test-secret-test-secret-test-secret-123', NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const db = createPool(c);
    const app = await buildApp(c, db);
    const r = await app.inject({ method: 'POST', url: '/webhooks/stripe', payload: { type: 'payment_intent.succeeded' } });
    expect(r.statusCode).toBe(503);
    const checkout = await app.inject({ method: 'POST', url: '/requests/0123456789abcdef0123/checkout', payload: { method: 'ideal', payerName: 'Guest' } });
    expect(checkout.statusCode).toBe(503);
    await app.close();
    await db.end();
  });
});
