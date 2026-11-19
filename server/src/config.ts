import { z } from 'zod';

/** All configuration comes from environment variables (DigitalOcean App Platform secrets in production). */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  /** Managed PostgreSQL CA certificate (PEM). DigitalOcean provides it as ${db.CA_CERT}. */
  DATABASE_CA_CERT: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  APP_ORIGINS: z.string().default('http://localhost:8081'),
  SPACES_ENDPOINT: z.string().url().optional(),
  SPACES_REGION: z.string().default('ams3'),
  SPACES_BUCKET: z.string().optional(),
  SPACES_KEY: z.string().optional(),
  SPACES_SECRET: z.string().optional(),
  /** Public CDN base, e.g. https://hayve-media.ams3.cdn.digitaloceanspaces.com */
  SPACES_CDN_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default('Hayve <no-reply@hayve.app>'),
  POSTMARK_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return parsed.data;
}

export const storageConfigured = (c: Config) => !!(c.SPACES_ENDPOINT && c.SPACES_BUCKET && c.SPACES_KEY && c.SPACES_SECRET && c.SPACES_CDN_URL);
