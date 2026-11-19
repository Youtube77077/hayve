import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { type Config, storageConfigured } from './config.js';
import { asSystem, asUser, type Db } from './db.js';
import { ApiError, bad, forbidden } from './errors.js';
import { AVATAR_MAX_BYTES, AVATAR_TYPES, checkAvatarUpload, renderAvatar } from './images.js';
import { verifyPassword } from './security.js';
import type { Storage } from './storage.js';

export function meRoutes(app: FastifyInstance, db: Db, c: Config, storage: Storage | null) {
  const needStorage = () => {
    if (!storage || !storageConfigured(c)) throw new ApiError(503, 'storage_unavailable', 'Uploads are not configured');
    return storage;
  };

  app.get('/me', async (req) => {
    const id = requireUser(req);
    const u = (await db.query('select email, email_verified_at, totp_enabled_at from auth.users where id = $1', [id])).rows[0];
    const profile = await asUser(db, req.actor, async (tx) => (await tx.query('select * from public.profiles where id = $1', [id])).rows[0]);
    const roles = await asUser(db, req.actor, async (tx) => (await tx.query('select role from public.user_roles where user_id = $1', [id])).rows.map((r) => r.role));
    return { id, email: u.email, emailVerified: !!u.email_verified_at, twoFactor: !!u.totp_enabled_at, aal: req.actor.aal, roles, profile };
  });

  app.patch('/me/profile', async (req) => {
    const id = requireUser(req);
    const body = z
      .object({
        displayName: z.string().trim().min(2).max(80).optional(),
        bio: z.string().trim().max(200).optional(),
        city: z.string().trim().max(80).optional(),
        isPublic: z.boolean().optional(),
        wishlistVisibility: z.enum(['public', 'link', 'private']).optional(),
      })
      .parse(req.body);
    return asUser(db, req.actor, async (tx) => {
      const r = await tx.query(
        `update public.profiles set display_name = coalesce($2, display_name), bio = coalesce($3, bio), city = coalesce($4, city),
         is_public = coalesce($5, is_public), wishlist_visibility = coalesce($6, wishlist_visibility) where id = $1 returning *`,
        [id, body.displayName ?? null, body.bio ?? null, body.city ?? null, body.isPublic ?? null, body.wishlistVisibility ?? null],
      );
      return r.rows[0];
    });
  });

  /** Step 1: presigned POST straight to Spaces (type and size enforced by the upload policy). */
  app.post('/me/avatar/upload-url', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const id = requireUser(req);
    const { contentType, size } = z.object({ contentType: z.enum(AVATAR_TYPES), size: z.number().int().positive() }).parse(req.body);
    if (size > AVATAR_MAX_BYTES) throw bad('Pictures can be at most 5 MB');
    const key = `incoming/${id}/${randomUUID()}`;
    const post = await needStorage().presignAvatarUpload(key, contentType);
    return { key, ...post };
  });

  /** Step 2: verify the real bytes, square-crop and resize to 400 and 96 px, store public URLs. */
  app.post('/me/avatar/complete', async (req) => {
    const id = requireUser(req);
    const { key } = z.object({ key: z.string() }).parse(req.body);
    if (!key.startsWith(`incoming/${id}/`)) throw forbidden();
    const s = needStorage();
    let bytes: Uint8Array;
    try {
      bytes = await s.read(key, AVATAR_MAX_BYTES);
    } catch {
      await s.remove(key);
      throw bad('Upload not found or larger than 5 MB');
    }
    const problem = checkAvatarUpload(bytes);
    if (problem) {
      await s.remove(key);
      throw bad(problem);
    }
    const { full, thumb } = await renderAvatar(bytes);
    const stamp = randomUUID();
    const [fullUrl, thumbUrl] = await Promise.all([s.putPublic(`avatars/${id}/${stamp}-400.jpg`, full, 'image/jpeg'), s.putPublic(`avatars/${id}/${stamp}-96.jpg`, thumb, 'image/jpeg')]);
    await s.remove(key);
    const old = await asUser(db, req.actor, async (tx) => {
      const prev = (await tx.query('select avatar_url, avatar_thumb_url from public.profiles where id = $1', [id])).rows[0];
      await tx.query('update public.profiles set avatar_url = $2, avatar_thumb_url = $3 where id = $1', [id, fullUrl, thumbUrl]);
      return prev;
    });
    for (const u of [old?.avatar_url, old?.avatar_thumb_url]) {
      const k = u && s.keyFromUrl(u);
      if (k) await s.remove(k);
    }
    return { avatarUrl: fullUrl, avatarThumbUrl: thumbUrl };
  });

  app.delete('/me/avatar', async (req) => {
    const id = requireUser(req);
    await asUser(db, req.actor, (tx) => tx.query('update public.profiles set avatar_url = null, avatar_thumb_url = null where id = $1', [id]));
    return { ok: true };
  });

  /** GDPR: download everything linked to the account (read through RLS, so only own rows). */
  app.get('/me/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const id = requireUser(req);
    const account = (await db.query('select id, email, email_verified_at, totp_enabled_at is not null as two_factor, created_at from auth.users where id = $1', [id])).rows[0];
    const data = await asUser(db, req.actor, async (tx) => {
      const out: Record<string, unknown> = {};
      const tables: [string, string][] = [
        ['profile', 'select * from public.profiles where id = $1'],
        ['roles', 'select role, granted_at from public.user_roles where user_id = $1'],
        ['addresses', 'select * from public.addresses where user_id = $1'],
        ['listings', 'select * from public.products where seller_id = $1'],
        ['wishlist', 'select * from public.wishlist_items where owner_id = $1'],
        ['orders', 'select * from public.orders where buyer_id = $1 or seller_id = $1'],
        ['notifications', 'select * from public.notifications where user_id = $1'],
        ['reports', 'select * from public.reports where reporter_id = $1'],
      ];
      for (const [name, sql] of tables) {
        await tx.query('savepoint s');
        try {
          out[name] = (await tx.query(sql, [id])).rows;
          await tx.query('release savepoint s');
        } catch {
          await tx.query('rollback to savepoint s');
        }
      }
      return out;
    });
    reply.header('Content-Disposition', 'attachment; filename="hayve-my-data.json"');
    return { exportedAt: new Date().toISOString(), account, ...data };
  });

  /**
   * GDPR: delete the account. Personal data is removed; records that must be kept by law
   * (payments, invoices) stay, linked only to an anonymised account.
   */
  app.delete('/me', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const id = requireUser(req);
    const { password } = z.object({ password: z.string() }).parse(req.body);
    const u = (await db.query('select password_hash from auth.users where id = $1', [id])).rows[0];
    if (!(await verifyPassword(u.password_hash, password))) throw bad('Password is incorrect');
    await anonymiseUser(db, id);
    return { ok: true };
  });
}

export async function anonymiseUser(db: Db, id: string) {
  await asSystem(db, async (tx) => {
    await tx.query(`update auth.users set email = 'deleted-' || id || '@deleted.invalid', password_hash = null, totp_secret = null, totp_pending_secret = null, deleted_at = now(), session_version = session_version + 1 where id = $1`, [id]);
    await tx.query(`update public.profiles set username = 'deleted_' || substr(replace(id::text, '-', ''), 1, 10), display_name = 'Deleted user', bio = '', avatar_url = null, avatar_thumb_url = null, city = '', is_public = false, wishlist_visibility = 'private' where id = $1`, [id]);
    for (const sql of ['delete from public.addresses where user_id = $1', 'delete from public.wishlist_items where owner_id = $1', "update public.products set status = 'removed' where seller_id = $1", 'delete from public.notifications where user_id = $1']) {
      await tx.query('savepoint s');
      try {
        await tx.query(sql, [id]);
        await tx.query('release savepoint s');
      } catch {
        await tx.query('rollback to savepoint s');
      }
    }
  });
}
