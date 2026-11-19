import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

/**
 * Applies server/sql/000_platform.sql, supabase/migrations/*.sql and server/sql/090_grants.sql
 * in order, once each. Run as a DigitalOcean App Platform pre-deploy job.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

async function main() {
  const db = createPool(loadConfig());
  const files = [
    join(root, 'server/sql/000_platform.sql'),
    ...readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(root, 'supabase/migrations', f)),
  ];
  await db.query('create schema if not exists hayve_meta; create table if not exists hayve_meta.migrations (name text primary key, applied_at timestamptz not null default now())');
  for (const f of files) {
    const name = f.slice(root.length + 1);
    const done = await db.query('select 1 from hayve_meta.migrations where name = $1', [name]);
    if (done.rowCount) continue;
    console.log(`applying ${name}`);
    const client = await db.connect();
    try {
      await client.query(readFileSync(f, 'utf8'));
      await client.query('insert into hayve_meta.migrations (name) values ($1)', [name]);
    } finally {
      client.release();
    }
  }
  await db.query(readFileSync(join(root, 'server/sql/090_grants.sql'), 'utf8'));
  await db.end();
  console.log('migrations up to date');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
