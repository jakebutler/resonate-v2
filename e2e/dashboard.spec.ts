import { test, expect } from '@playwright/test'

// TODO: Expand these tests once E2E auth setup is in place (e.g. via Clerk test mode).
// Current coverage: smoke-test that the app boots and redirects unauthenticated users.
// Future: test full logged-in dashboard flows (create post, switch views, open editor).
test.describe('Dashboard', () => {
  test('loads the home page', async ({ page }) => {
    await page.goto('/')
    // Should either redirect to sign-in or show dashboard
    await expect(page).toHaveURL(/\/(sign-in|$)/)
  })
})
