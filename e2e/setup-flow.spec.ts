import { test, expect } from '@playwright/test'

// TODO: Expand these tests once E2E auth setup is in place.
// Current coverage: smoke-test that /setup boots and redirects if unauthenticated.
// Future: test the full setup flow — toggle blog/linkedin, fill fields, click Continue, verify redirect to /.
test.describe('Setup flow', () => {
  test('setup page renders', async ({ page }) => {
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/(setup|sign-in)/)
  })
})
