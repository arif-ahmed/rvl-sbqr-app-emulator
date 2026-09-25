import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// End-to-end login flow against the REAL fi-idp-mock (rvl-sbqr-mocks), not a
// stub: Playwright boots `node server.js` from the mocks repo and a fresh Vite
// dev server whose /idp proxy points at it. Dedicated ports keep this from
// colliding with a dev server you already have running on :5173 / :5105.
//
// Override the mock location with IDP_MOCK_DIR if the repos are not siblings.
const IDP_PORT = Number(process.env.E2E_IDP_PORT || 5115);
const APP_PORT = Number(process.env.E2E_APP_PORT || 5183);
const IDP_ORIGIN = `http://localhost:${IDP_PORT}`;
const IDP_MOCK_DIR =
  process.env.IDP_MOCK_DIR || path.resolve(import.meta.dirname,'../rvl-sbqr-mocks/services/fi-idp-mock/src');

// Read by the specs to fetch the JWKS straight from the IdP.
process.env.E2E_IDP_ORIGIN = IDP_ORIGIN;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts', // not *.spec.ts — keeps vitest's default glob off these files
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    viewport: { width: 1280, height: 960 },
    screenshot: 'on',
    trace: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 960 } } }],
  webServer: [
    {
      name: 'fi-idp-mock',
      command: 'node server.js',
      cwd: IDP_MOCK_DIR,
      url: `${IDP_ORIGIN}/health`,
      env: { FI_ID: 'dhakabank', PORT: String(IDP_PORT) },
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 30_000,
    },
    {
      name: 'emulator',
      command: `npx vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      // process.env beats .env in Vite's loadEnv, so these win over the dev .env.
      env: { IDP_URL: IDP_ORIGIN },
      reuseExistingServer: false,
      // The BFF is not started here, so Vite logs ECONNREFUSED for every
      // /bff/health/ready probe. Muted to keep the IdP log readable.
      stderr: 'ignore',
      timeout: 60_000,
    },
  ],
});
