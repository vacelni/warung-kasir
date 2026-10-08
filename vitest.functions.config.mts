import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Edge Function integration tests: real HTTP against the local Supabase stack with the edge
// runtime (`npx supabase start`, see docs/RUNBOOK.md). Not part of `npm test`, which needs no stack.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/functions/**/*.test.ts'],
    // One file, serial: the tests share accounts and a temporary trigger.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
