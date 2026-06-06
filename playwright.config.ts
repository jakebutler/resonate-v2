import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT || '3000'
const hostname = process.env.PLAYWRIGHT_HOST || '127.0.0.1'
const baseURL = process.env.BASE_URL || `http://${hostname}:${port}`

export default defineConfig({
  testDir: './e2e',
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
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
