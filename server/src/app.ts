import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { adminRoutes } from './admin.js';
import { authHook, authRoutes } from './auth.js';
import { type Config, storageConfigured } from './config.js';
import type { Db } from './db.js';
import { ApiError } from './errors.js';
import { meRoutes } from './me.js';
import { Storage } from './storage.js';

/** Builds the API (exported separately from the listener so tests can inject requests). */
export async function buildApp(c: Config, db: Db) {
  const app = Fastify({ logger: c.NODE_ENV !== 'test', trustProxy: true, bodyLimit: 256 * 1024 });
  await app.register(cors, { origin: c.APP_ORIGINS.split(',').map((s) => s.trim()), credentials: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: 'invalid', message: err.issues[0]?.message ?? 'Invalid request' });
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Too many requests. Slow down a little.' });
    // RLS / permission errors from PostgreSQL
    if ((err as { code?: string }).code === '42501') return reply.status(403).send({ error: 'forbidden', message: 'You do not have access' });
    app.log.error(err);
    return reply.status(500).send({ error: 'server_error', message: 'Something went wrong' });
  });

  app.get('/health', async () => {
    await db.query('select 1');
    return { ok: true };
  });

  /** Public: fee tiers and Wave Back settings (shown at checkout). */
  app.get('/settings', async () => (await db.query('select fee_tiers, wave_back from public.app_settings limit 1')).rows[0] ?? {});

  authHook(app, db, c);
  const storage = storageConfigured(c) ? new Storage(c) : null;
  authRoutes(app, db, c);
  meRoutes(app, db, c, storage);
  adminRoutes(app, db, storage);
  return app;
}
