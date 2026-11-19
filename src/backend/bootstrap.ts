import { restoreSession } from './api/session';
import { createSeedDatabase, DB_VERSION } from './seed';
import { attachStorage, DB_KEY, flush, SESSION_KEY, setDatabase, type StorageAdapter } from './store';
import type { Database } from './types';

/** Loads persisted data (or seeds a fresh dataset) and restores the session. */
export async function initBackend(storage: StorageAdapter | null) {
  attachStorage(storage);
  let db: Database | null = null;
  let sessionId: string | null = null;
  if (storage) {
    try {
      const raw = await storage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.version === DB_VERSION) db = parsed;
      }
      sessionId = await storage.getItem(SESSION_KEY);
    } catch {
      db = null;
    }
  }
  if (db) setDatabase(db);
  else {
    createSeedDatabase();
    await flush();
  }
  restoreSession(sessionId);
}

/** Restores the sample dataset (Profile → Developer tools). */
export async function resetDemoData() {
  createSeedDatabase();
  await flush();
}
