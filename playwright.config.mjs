// Browser smoke tests (npm run e2e): the production build, served by `vite preview`, in a
// real browser with WebGL (software-rendered, so it runs headless and in CI).
// Locally, PW_CHANNEL=chrome (or msedge) uses an installed browser instead of Playwright's.
// PW_PREBUILT=1 serves the dist/ that's already there instead of building it first (CI
// builds once, and deploys the build it tested). PW_PORT moves the server off 4173, so two
// checkouts can run their e2e at the same time.
//
// The admin (e2e/admin.spec.mjs) runs on a second server: `npm run admin:preview`, the built
// admin under its production security headers (admin/server/csp.js), its live preview
// framing the site above, and its local API read-only (ADMIN_READONLY: no test writes to
// src/content.json). It listens 100 ports above the site (PW_ADMIN_PORT moves it); the
// spec finds it in PW_ADMIN_ORIGIN.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.PW_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;
const preview = `npx vite preview --port ${port} --strictPort --host 127.0.0.1`;
const adminPort = Number(process.env.PW_ADMIN_PORT) || port + 100;
const adminOrigin = `http://127.0.0.1:${adminPort}`;
process.env.PW_ADMIN_ORIGIN = adminOrigin;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined, // Software-rendered WebGL scenes compete for CPU in CI.
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: origin,
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] },
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: process.env.PW_PREBUILT ? preview : `npm run build && ${preview}`,
      url: origin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run admin:preview -- --port ${adminPort} --strictPort`,
      url: `${adminOrigin}/`,
      env: { ADMIN_READONLY: '1', ADMIN_SITE_URL: `${origin}/` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
