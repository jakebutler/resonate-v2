import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT || '3000'
const hostname = process.env.PLAYWRIGHT_HOST || '127.0.0.1'
const baseURL = process.env.BASE_URL || `http://${hostname}:${port}`

export default defineConfig({
  testDir: './e2e',
  // Mints a Clerk dev-instance session into e2e/.auth/state.json when keys are
  // configured; otherwise records a named skip reason and exits. See
  // docs/e2e-authenticated-sessions.md.
  globalSetup: './e2e/global-setup',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // NOTE: 'npm run start' serves the compiled Next.js build.
  // Run 'npm run build' before running E2E tests locally for the first time,
  // or whenever you change production code. The CI workflow handles this automatically.
  webServer: {
    command: `npm run start -- --hostname ${hostname} --port ${port}`,
    env: {
      HOSTNAME: hostname,
      PORT: port,
      E2E_BYPASS_AUTH: process.env.E2E_BYPASS_AUTH || '',
      // Real-session runs (authenticated-session.spec.ts) need the proxy's
      // allowlist and its Clerk Backend lookup for email resolution; both are
      // absent under the bypass, so passing them through is harmless there.
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY_DEV || process.env.CLERK_SECRET_KEY || '',
      RESONATE_ALLOWED_EMAILS: process.env.RESONATE_ALLOWED_EMAILS || '',
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
