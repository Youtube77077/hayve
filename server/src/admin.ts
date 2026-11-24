import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { asSystem, asUser, type Db, type Tx } from './db.js';
import { bad, forbidden, notFound } from './errors.js';
import { validateTiers } from './fees.js';
import { anonymiseUser } from './me.js';
import type { Storage } from './storage.js';
import { fetchPublicPage } from './pagefetch.js';

/**
 * Admin API. Every request must come from an admin with a verified email and an aal2
 * session (two-factor). Every action is written to public.admin_audit_log.
 */
async function requireAdmin(db: Db, req: FastifyRequest) {
  const id = requireUser(req);
  if (req.actor.aal !== 'aal2') throw forbidden('Admin access needs two-step verification');
  const u = (await db.query('select email_verified_at from auth.users where id = $1', [id])).rows[0];
  if (!u?.email_verified_at) throw forbidden('Verify your email to use admin tools');
  const ok = await asUser(db, req.actor, async (tx) => (await tx.query('select public.is_admin() as ok')).rows[0].ok);
  if (!ok) throw forbidden();
  return id;
}

async function audit(tx: Tx, adminId: string, action: string, targetKind: string, targetId: string, detail: object = {}) {
  await tx.query('insert into public.admin_audit_log (admin_id, action, target_kind, target_id, detail) values ($1, $2, $3, $4, $5)', [adminId, action, targetKind, targetId, JSON.stringify(detail)]);
}

export function adminRoutes(app: FastifyInstance, db: Db, storage: Storage | null) {
  // Admin import (demos): reads a public page so the app can turn its preview data into a listing.
  app.get('/admin/import/fetch', async (req, reply) => {
    const adminId = await requireAdmin(db, req);
    const { url } = z.object({ url: z.string().url().max(2000) }).parse(req.query);
    try {
      const html = await fetchPublicPage(url);
      await asSystem(db, (tx) => audit(tx, adminId, 'import.fetch', 'url', url.slice(0, 200)));
      return reply.type('text/html; charset=utf-8').send(html);
    } catch (e) {
      throw bad((e as Error).message);
    }
  });

  app.get('/admin/overview', async (req) => {
    await requireAdmin(db, req);
    const q = (sql: string) => db.query(sql).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);
    return {
      users: await q('select count(*) n from auth.users where deleted_at is null'),
      orders: await q('select count(*) n from public.orders'),
      feeRevenueCents: await q("select coalesce(sum(protection_fee_cents), 0) n from public.orders where status not in ('cancelled', 'refunded')"),
      waveBackPaidCents: await q("select coalesce(sum(amount_cents), 0) n from public.transactions where type = 'wave_back' and status = 'completed'"),
      pendingVerifications: await q("select count(*) n from public.businesses where status = 'pending'"),
      openReports: await q("select count(*) n from public.reports where status = 'open'"),
    };
  });

  app.get('/admin/users', async (req) => {
    await requireAdmin(db, req);
    const { q = '' } = z.object({ q: z.string().max(100).optional() }).parse(req.query);
    const r = await db.query(
      `select u.id, u.email, u.email_verified_at, u.created_at, p.username, p.display_name, p.avatar_thumb_url, p.suspended_at,
              coalesce((select array_agg(role) from public.user_roles r where r.user_id = u.id), '{}') roles
       from auth.users u join public.profiles p on p.id = u.id
       where u.deleted_at is null and ($1 = '' or u.email ilike '%' || $1 || '%' or p.username ilike '%' || $1 || '%' or p.display_name ilike '%' || $1 || '%')
       order by u.created_at desc limit 100`,
      [q.trim()],
    );
    return r.rows;
  });

  app.post('/admin/users/:id/suspend', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
    if (id === adminId) throw bad("You can't suspend yourself");
    await asSystem(db, async (tx) => {
      const r = await tx.query('update public.profiles set suspended_at = now(), suspension_reason = $2 where id = $1', [id, reason]);
      if (!r.rowCount) throw notFound('User not found');
      await tx.query('update auth.users set session_version = session_version + 1 where id = $1', [id]);
      await audit(tx, adminId, 'suspend_user', 'user', id, { reason });
    });
    return { ok: true };
  });

  app.post('/admin/users/:id/unsuspend', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await asSystem(db, async (tx) => {
      await tx.query('update public.profiles set suspended_at = null, suspension_reason = null where id = $1', [id]);
      await audit(tx, adminId, 'unsuspend_user', 'user', id);
    });
    return { ok: true };
  });

  app.delete('/admin/users/:id', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (id === adminId) throw bad("You can't delete yourself");
    await anonymiseUser(db, id);
    await asSystem(db, (tx) => audit(tx, adminId, 'delete_user', 'user', id));
    return { ok: true };
  });

  /** Only admins can add admins; enforced again in the database (user_roles trigger). */
  app.post('/admin/admins', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
    await asUser(db, req.actor, async (tx) => {
      await tx.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict do nothing", [userId]);
      await audit(tx, adminId, 'grant_admin', 'user', userId);
    });
    return { ok: true };
  });

  app.delete('/admin/profiles/:id/avatar', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const prev = await asSystem(db, async (tx) => {
      const p = (await tx.query('select avatar_url, avatar_thumb_url from public.profiles where id = $1', [id])).rows[0];
      await tx.query('update public.profiles set avatar_url = null, avatar_thumb_url = null where id = $1', [id]);
      await audit(tx, adminId, 'remove_avatar', 'user', id);
      return p;
    });
    for (const u of [prev?.avatar_url, prev?.avatar_thumb_url]) {
      const k = u && storage?.keyFromUrl(u);
      if (k) await storage!.remove(k);
    }
    return { ok: true };
  });

  app.delete('/admin/profiles/:id/bio', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await asSystem(db, async (tx) => {
      await tx.query("update public.profiles set bio = '' where id = $1", [id]);
      await audit(tx, adminId, 'remove_bio', 'user', id);
    });
    return { ok: true };
  });

  app.delete('/admin/listings/:id', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body ?? {});
    await asSystem(db, async (tx) => {
      await tx.query("update public.products set status = 'removed' where id = $1", [id]);
      await audit(tx, adminId, 'remove_listing', 'listing', id, { reason });
    });
    return { ok: true };
  });

  app.get('/admin/verifications', async (req) => {
    await requireAdmin(db, req);
    return asUser(db, req.actor, async (tx) => (await tx.query("select * from public.businesses order by (status = 'pending') desc, submitted_at desc limit 200")).rows);
  });

  app.post('/admin/verifications/:id', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() }).parse(req.body);
    if (body.decision === 'reject' && (!body.reason || body.reason.length < 3)) throw bad('Give a reason for the rejection');
    await asUser(db, req.actor, async (tx) => {
      const r = await tx.query('update public.businesses set status = $2, rejection_reason = $3 where id = $1', [id, body.decision === 'approve' ? 'verified' : 'rejected', body.decision === 'reject' ? body.reason : null]);
      if (!r.rowCount) throw notFound('Application not found');
      await audit(tx, adminId, body.decision === 'approve' ? 'verify_business' : 'reject_business', 'business', id, { reason: body.reason });
    });
    return { ok: true };
  });

  app.get('/admin/reports', async (req) => {
    await requireAdmin(db, req);
    return asUser(db, req.actor, async (tx) => (await tx.query("select * from public.reports order by (status = 'open') desc, created_at desc limit 200")).rows);
  });

  app.post('/admin/reports/:id', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { status } = z.object({ status: z.enum(['resolved', 'dismissed']) }).parse(req.body);
    await asUser(db, req.actor, async (tx) => {
      await tx.query('update public.reports set status = $2, resolved_by = auth.uid() where id = $1', [id, status]);
      await audit(tx, adminId, `report_${status}`, 'report', id);
    });
    return { ok: true };
  });

  app.put('/admin/settings/fees', async (req) => {
    const adminId = await requireAdmin(db, req);
    const { tiers } = z.object({ tiers: z.array(z.object({ upTo: z.number().int().positive().nullable(), rate: z.number() })).min(1).max(8) }).parse(req.body);
    const problem = validateTiers(tiers);
    if (problem) throw bad(problem);
    await asUser(db, req.actor, async (tx) => {
      await tx.query('update public.app_settings set fee_tiers = $1, updated_at = now(), updated_by = auth.uid()', [JSON.stringify(tiers)]);
      await audit(tx, adminId, 'update_fee_tiers', 'settings', 'fees', { tiers });
    });
    return { ok: true };
  });

  app.put('/admin/settings/wave-back', async (req) => {
    const adminId = await requireAdmin(db, req);
    const s = z
      .object({
        shopRate: z.number().min(0).max(0.1),
        shopMaxPerPurchaseCents: z.number().int().min(0).max(10000),
        servicesRate: z.number().min(0).max(0.1),
        newUserRate: z.number().min(0).max(0.2),
        newUserDays: z.number().int().min(0).max(365),
        newUserMaxTotalCents: z.number().int().min(0).max(50000),
        monthlyMaxCents: z.number().int().min(0).max(50000),
      })
      .parse(req.body);
    await asUser(db, req.actor, async (tx) => {
      await tx.query('update public.app_settings set wave_back = $1, updated_at = now(), updated_by = auth.uid()', [JSON.stringify(s)]);
      await audit(tx, adminId, 'update_wave_back', 'settings', 'wave_back', s);
    });
    return { ok: true };
  });

  app.get('/admin/audit', async (req) => {
    await requireAdmin(db, req);
    return asUser(db, req.actor, async (tx) => (await tx.query('select * from public.admin_audit_log order by created_at desc limit 500')).rows);
  });
}
