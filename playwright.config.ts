import { defineConfig, devices } from '@playwright/test';

// Viewports required by TEST_PLAN G.12: the three phone widths, and the desktop width.
const phoneViewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
];
const DESKTOP = { width: 1280, height: 800 };

const PORT = 3100;
// The built static export (out/), served like Cloudflare: the production-like target. The service
// worker, offline, and static-route specs run here, and so do the static-* copies of the others.
// Port 3000 on purpose: it is already one of the origins the admin-cashier Edge Function accepts
// locally (supabase/config.toml ALLOWED_ORIGINS), so the repository's config needs no test-only origin.
const STATIC_PORT = 3000;

const MUTATION_SPECS = /\.mutation\.spec\.ts$/;
const OFFLINE_SPECS = /\.offline\.spec\.ts$/;

const dev = { baseURL: `http://localhost:${PORT}` };
const staticBuild = { baseURL: `http://localhost:${STATIC_PORT}`, serviceWorkers: 'allow' as const };

const phone = { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } };
// G.13 desktop browsers: Chromium (Chrome) and Microsoft Edge (the installed `msedge` channel).
const chromiumDesktop = { ...devices['Desktop Chrome'], viewport: DESKTOP };
const edgeDesktop = { ...devices['Desktop Edge'], channel: 'msedge', viewport: DESKTOP };

export default defineConfig({
  testDir: './tests/e2e',
  // Creates the empty-store fixture for the empty-state specs and removes it after the run.
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...dev,
    trace: 'on-first-retry',
  },
  projects: [
    // Read-only specs, once per viewport, in parallel, against `next dev`.
    ...phoneViewports.map(({ name, width, height }) => ({
      name,
      testIgnore: [MUTATION_SPECS, OFFLINE_SPECS],
      use: { ...devices['Pixel 7'], viewport: { width, height } },
    })),
    // G.12 desktop width and G.13 desktop browsers: the same read-only specs.
    { name: 'chromium', testIgnore: [MUTATION_SPECS, OFFLINE_SPECS], use: chromiumDesktop },
    { name: 'msedge', testIgnore: [MUTATION_SPECS, OFFLINE_SPECS], use: edgeDesktop },
    // Phase 11: the same read-only specs against the production build in out/ (no next dev), on a
    // phone and on the desktop.
    { name: 'static', testIgnore: [MUTATION_SPECS, OFFLINE_SPECS], use: { ...phone, ...staticBuild } },
    { name: 'static-desktop', testIgnore: [MUTATION_SPECS, OFFLINE_SPECS], use: { ...chromiumDesktop, ...staticBuild } },
    // Specs that change shared catalog data (create/deactivate products, categories). They run
    // once per browser, one at a time, and only after every read-only project has finished, so a
    // read-only test never sees a half-changed menu. Each project follows the previous one.
    {
      name: 'mutations',
      testMatch: MUTATION_SPECS,
      fullyParallel: false,
      dependencies: [...phoneViewports.map(({ name }) => name), 'chromium', 'msedge', 'static', 'static-desktop'],
      use: phone,
    },
    {
      name: 'mutations-edge',
      testMatch: MUTATION_SPECS,
      fullyParallel: false,
      dependencies: ['mutations'],
      use: edgeDesktop,
    },
    {
      name: 'static-mutations',
      testMatch: MUTATION_SPECS,
      fullyParallel: false,
      dependencies: ['mutations-edge'],
      use: { ...phone, ...staticBuild },
    },
    // Offline, sync, and service worker specs (TEST_PLAN G.9–G.11): against the production build,
    // because the service worker exists only there. They save sales, sign accounts in and out, and
    // briefly deactivate a cashier, so they run alone, after everything else.
    {
      name: 'offline',
      testMatch: OFFLINE_SPECS,
      fullyParallel: false,
      dependencies: ['static-mutations'],
      use: { ...phone, ...staticBuild },
    },
    {
      name: 'offline-edge',
      testMatch: OFFLINE_SPECS,
      fullyParallel: false,
      dependencies: ['offline'],
      // The offline specs drive the phone layout (bottom navigation, top bar), on the Edge binary.
      use: { ...phone, channel: 'msedge', ...staticBuild },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Builds out/ (next build + sw.js), then serves it.
      command: `npm run build && node tests/e2e/support/static-server.mts ${STATIC_PORT}`,
      url: `http://localhost:${STATIC_PORT}`,
      // Never adopt a `next dev` that happens to run on :3000: it would not be the production build.
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
