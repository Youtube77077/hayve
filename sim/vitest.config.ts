import { defineConfig } from 'vitest/config';

// Runs the 1,000-person simulation: npx vitest run --config sim/vitest.config.ts
export default defineConfig({ test: { include: ['sim/**/*.sim.ts'], testTimeout: 900_000 } });
