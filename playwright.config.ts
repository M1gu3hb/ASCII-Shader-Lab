import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. By default they run against the production build (vite preview).
 * Set BASE_URL to test a deployed site, e.g. BASE_URL=https://glyphos-ascii.vercel.app npm run test:e2e
 * (PW_PROXY and PW_ARGS allow routing through a corporate proxy if needed).
 */
const remote = process.env.BASE_URL;
const extraArgs = (process.env.PW_ARGS ?? '').split(' ').filter(Boolean);
/** PW_PORT lets several checkouts (worktrees) run the suite at the same time. */
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: remote ?? `http://localhost:${port}`,
    acceptDownloads: true,
    proxy: process.env.PW_PROXY ? { server: process.env.PW_PROXY } : undefined,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...extraArgs] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: remote ? undefined : {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
