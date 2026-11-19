import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from './config.js';
import { type Actor, asSystem, type Db } from './db.js';
import { sendEmail } from './email.js';
import { ApiError, bad, forbidden, unauthorized } from './errors.js';
import { hashPassword, newTotpSecret, passwordProblem, randomToken, readSession, sha256, signSession, totpUri, verifyPassword, verifyTotp } from './security.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

const Email = z.string().trim().toLowerCase().email().max(200);

/** Resolves the bearer token into an Actor (anonymous when absent). Revoked sessions are rejected. */
export function authHook(app: FastifyInstance, db: Db, c: Config) {
  app.decorateRequest('actor', null as unknown as Actor);
  app.addHook('onRequest', async (req) => {
    req.actor = { userId: null, aal: 'aal1' };
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return;
    const s = await readSession(c.JWT_SECRET, h.slice(7));
    if (!s) throw unauthorized('Your session has expired');
    const row = await db.query('select session_version, deleted_at, (select suspended_at from public.profiles where id = u.id) as suspended_at from auth.users u where id = $1', [s.sub]);
    const u = row.rows[0];
    if (!u || u.deleted_at || u.session_version !== s.sv) throw unauthorized('Your session has expired');
    if (u.suspended_at) throw forbidden('This account is suspended');
    req.actor = { userId: s.sub, aal: s.aal };
  });
}

export function requireUser(req: FastifyRequest) {
  if (!req.actor.userId) throw unauthorized();
  return req.actor.userId;
}

async function issueVerification(db: Db, c: Config, userId: string, email: string) {
  const token = randomToken();
  await db.query("insert into auth.email_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, 'verify_email', now() + interval '24 hours')", [sha256(token), userId]);
  const origin = c.APP_ORIGINS.split(',')[0];
  await sendEmail(c, email, 'Confirm your Hayve email', `Welcome to Hayve.\n\nConfirm your email: ${origin}/verify-email?token=${token}\n\nThis link expires in 24 hours.`);
}

export function authRoutes(app: FastifyInstance, db: Db, c: Config) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/sign-up', strict, async (req) => {
    const body = z.object({ email: Email, password: z.string(), displayName: z.string().trim().min(2).max(80), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,20}$/) }).parse(req.body);
    const problem = passwordProblem(body.password);
    if (problem) throw bad(problem);
    const hash = await hashPassword(body.password);
    const user = await asSystem(db, async (tx) => {
      const taken = await tx.query('select 1 from auth.users where email = $1 union all select 1 from public.profiles where username = $2', [body.email, body.username]);
      if (taken.rowCount) throw new ApiError(409, 'conflict', 'That email or username is already in use');
      const u = await tx.query('insert into auth.users (email, password_hash) values ($1, $2) returning id, session_version', [body.email, hash]);
      await tx.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [u.rows[0].id, body.username, body.displayName]);
      await tx.query("insert into public.user_roles (user_id, role) values ($1, 'customer') on conflict do nothing", [u.rows[0].id]);
      return u.rows[0] as { id: string; session_version: number };
    });
    await issueVerification(db, c, user.id, body.email);
    return { token: await signSession(c.JWT_SECRET, { sub: user.id, aal: 'aal1', sv: user.session_version }), emailVerified: false };
  });

  app.post('/auth/verify-email', strict, async (req) => {
    const { token } = z.object({ token: z.string().min(20) }).parse(req.body);
    const r = await db.query("update auth.email_tokens set used_at = now() where token_hash = $1 and purpose = 'verify_email' and used_at is null and expires_at > now() returning user_id", [sha256(token)]);
    if (!r.rowCount) throw bad('This link is invalid or has expired');
    await db.query('update auth.users set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [r.rows[0].user_id]);
    return { ok: true };
  });

  app.post('/auth/resend-verification', strict, async (req) => {
    const id = requireUser(req);
    const u = (await db.query('select email, email_verified_at from auth.users where id = $1', [id])).rows[0];
    if (!u.email_verified_at) await issueVerification(db, c, id, u.email);
    return { ok: true };
  });

  app.post('/auth/sign-in', strict, async (req) => {
    const body = z.object({ email: Email, password: z.string().max(200), code: z.string().optional() }).parse(req.body);
    const u = (await db.query('select id, password_hash, totp_secret, totp_enabled_at, session_version, failed_logins, locked_until, deleted_at from auth.users where email = $1', [body.email])).rows[0];
    const fail = new ApiError(401, 'invalid_credentials', 'Email or password is incorrect');
    if (!u || u.deleted_at || !u.password_hash) {
      await hashPassword(body.password); // equalise timing
      throw fail;
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) throw new ApiError(429, 'locked', 'Too many attempts. Try again in a few minutes.');
    if (!(await verifyPassword(u.password_hash, body.password))) {
      await db.query("update auth.users set failed_logins = failed_logins + 1, locked_until = case when failed_logins + 1 >= 10 then now() + interval '15 minutes' else locked_until end where id = $1", [u.id]);
      throw fail;
    }
    let aal: 'aal1' | 'aal2' = 'aal1';
    if (u.totp_enabled_at) {
      if (!body.code) return { needsCode: true };
      if (!verifyTotp(u.totp_secret, body.code)) throw new ApiError(401, 'invalid_code', 'That code is not valid');
      aal = 'aal2';
    }
    await db.query('update auth.users set failed_logins = 0, locked_until = null where id = $1', [u.id]);
    return { token: await signSession(c.JWT_SECRET, { sub: u.id, aal, sv: u.session_version }) };
  });

  /** Start two-factor setup: returns an otpauth:// URI for the authenticator app. */
  app.post('/auth/2fa/setup', async (req) => {
    const id = requireUser(req);
    const secret = newTotpSecret();
    const u = (await db.query('update auth.users set totp_pending_secret = $2 where id = $1 returning email', [id, secret])).rows[0];
    return { otpauthUri: totpUri(secret, u.email), secret };
  });

  app.post('/auth/2fa/enable', strict, async (req) => {
    const id = requireUser(req);
    const { code } = z.object({ code: z.string() }).parse(req.body);
    const u = (await db.query('select totp_pending_secret, session_version from auth.users where id = $1', [id])).rows[0];
    if (!u?.totp_pending_secret || !verifyTotp(u.totp_pending_secret, code)) throw bad('That code is not valid');
    await db.query('update auth.users set totp_secret = totp_pending_secret, totp_pending_secret = null, totp_enabled_at = now() where id = $1', [id]);
    return { token: await signSession(c.JWT_SECRET, { sub: id, aal: 'aal2', sv: u.session_version }) };
  });

  app.post('/auth/2fa/disable', strict, async (req) => {
    const id = requireUser(req);
    const { password } = z.object({ password: z.string() }).parse(req.body);
    const u = (await db.query('select password_hash from auth.users where id = $1', [id])).rows[0];
    if (!(await verifyPassword(u.password_hash, password))) throw bad('Password is incorrect');
    const r = await db.query('update auth.users set totp_secret = null, totp_enabled_at = null, session_version = session_version + 1 where id = $1 returning session_version', [id]);
    return { token: await signSession(c.JWT_SECRET, { sub: id, aal: 'aal1', sv: r.rows[0].session_version }) };
  });

  app.post('/auth/change-password', strict, async (req) => {
    const id = requireUser(req);
    const body = z.object({ current: z.string(), next: z.string() }).parse(req.body);
    const problem = passwordProblem(body.next);
    if (problem) throw bad(problem);
    const u = (await db.query('select password_hash from auth.users where id = $1', [id])).rows[0];
    if (!(await verifyPassword(u.password_hash, body.current))) throw bad('Current password is incorrect');
    const r = await db.query('update auth.users set password_hash = $2, session_version = session_version + 1 where id = $1 returning session_version', [id, await hashPassword(body.next)]);
    return { token: await signSession(c.JWT_SECRET, { sub: id, aal: req.actor.aal, sv: r.rows[0].session_version }) };
  });

  /** Signs out every device. */
  app.post('/auth/sign-out-everywhere', async (req) => {
    const id = requireUser(req);
    await db.query('update auth.users set session_version = session_version + 1 where id = $1', [id]);
    return { ok: true };
  });
}
