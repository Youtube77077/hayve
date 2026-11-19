import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Starts a throwaway PostgreSQL (when the binaries are available) and applies the
 * migrations with the real migration runner. Sets TEST_DATABASE_URL for integration tests.
 */
export default async function setup(project: TestProject) {
  project.provide('databaseUrl', '');
  const bin = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'].find((b) => existsSync(join(b, 'initdb')));
  if (!bin) return;
  const data = mkdtempSync(join(tmpdir(), 'hayve-pg-'));
  const asRoot = process.getuid?.() === 0;
  const run = (cmd: string, args: string[]) => (asRoot ? execFileSync('sudo', ['-u', 'postgres', cmd, ...args], { stdio: 'pipe' }) : execFileSync(cmd, args, { stdio: 'pipe' }));
  if (asRoot) execFileSync('chown', ['-R', 'postgres', data]);
  const port = String(56000 + Math.floor(Math.random() * 1000));
  run(join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust']);
  run(join(bin, 'pg_ctl'), ['-D', data, '-o', `-p ${port} -k /tmp`, '-l', join(data, 'log'), 'start', '-w']);
  execFileSync('psql', ['-h', '/tmp', '-p', port, '-U', 'postgres', '-c', 'create database hayve']);
  const url = `postgres://postgres@localhost:${port}/hayve?host=/tmp`;
  const env = { ...process.env, DATABASE_URL: url, JWT_SECRET: 'test-secret-test-secret-test-secret-123', NODE_ENV: 'test' };
  const m = spawnSync('npx', ['tsx', 'src/migrate.ts'], { env, encoding: 'utf8' });
  if (m.status !== 0) throw new Error(`migrate failed: ${m.stderr || m.stdout}`);
  project.provide('databaseUrl', url);
  return () => {
    try {
      run(join(bin, 'pg_ctl'), ['-D', data, 'stop', '-m', 'immediate']);
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  };
}
