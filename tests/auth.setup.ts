/**
 * Auth setup: log in as team_admin and plain player via the real PIN
 * flow, save storage state. Runs once before all other test suites.
 * Uses the dedicated qa-club/qa-team fixture data (see .env.test) —
 * never the real pilot roster.
 */
import { test as setup, expect, type Page } from '@playwright/test'

const ADMIN_FILE = '.playwright/admin.json'
const PLAYER_FILE = '.playwright/player.json'

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
}

// PINs shorter than 6 digits never auto-submit — click the visible
// submit button explicitly. Safe for 6-digit PINs too: if auto-submit
// already navigated away, the button is simply gone.
async function submitPinIfNeeded(page: Page) {
  const submit = page.getByRole('button', { name: /^(Inloggen|Doorgaan|Pincode instellen)$/ })
  if (await submit.isVisible({ timeout: 500 }).catch(() => false)) {
    await submit.click()
  }
}

async function loginAsPlayer(page: Page, displayName: string, pin: string) {
  await page.goto(`/login?club=${process.env.QA_CLUB_SLUG}&team=${process.env.QA_TEAM_SLUG}`)
  await page.getByRole('button', { name: displayName, exact: true }).click()
  await enterPin(page, pin)
  await submitPinIfNeeded(page)
  await expect(page).toHaveURL('/', { timeout: 20_000 })
}

setup('authenticate as team_admin', async ({ page }) => {
  await loginAsPlayer(page, process.env.QA_TEAM_ADMIN_NAME!, process.env.QA_TEAM_ADMIN_PIN!)
  await page.context().storageState({ path: ADMIN_FILE })
})

setup('authenticate as player', async ({ page }) => {
  await loginAsPlayer(page, process.env.QA_PLAYER_NAME!, process.env.QA_PLAYER_PIN!)
  await page.context().storageState({ path: PLAYER_FILE })
})
