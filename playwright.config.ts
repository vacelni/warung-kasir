import { defineConfig, devices } from '@playwright/test';

// Mobile viewports required by TEST_PLAN G.12.
const viewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
];

const PORT = 3100;

const MUTATION_SPECS = /\.mutation\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    // Read-only specs, once per viewport, in parallel.
    ...viewports.map(({ name, width, height }) => ({
      name,
      testIgnore: MUTATION_SPECS,
      use: { ...devices['Pixel 7'], viewport: { width, height } },
    })),
    // Specs that change shared catalog data (create/deactivate products, categories). They run
    // once, on a phone viewport, and only after every read-only project has finished, so a
    // read-only test never sees a half-changed menu.
    {
      name: 'mutations',
      testMatch: MUTATION_SPECS,
      fullyParallel: false,
      dependencies: viewports.map(({ name }) => name),
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
