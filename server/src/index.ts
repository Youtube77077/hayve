import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const c = loadConfig();
const db = createPool(c);
const app = await buildApp(c, db);
await app.listen({ port: c.PORT, host: '0.0.0.0' });

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
