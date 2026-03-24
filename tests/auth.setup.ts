/**
 * Auth setup: log in as admin and player, save storage state.
 * Runs once before all other test suites.
 */
import { test as setup, expect } from '@playwright/test'

const ADMIN_FILE = '.playwright/admin.json'
const PLAYER_FILE = '.playwright/player.json'

async function login(page: any, email: string, password: string) {
  await page.goto('/login')
  // Step 1: email
  await page.getByPlaceholder('jouw@email.nl').fill(email)
  await page.getByRole('button', { name: 'Doorgaan' }).click()
  // Wait for password step (Supabase RPC can be slow on cold start in CI)
  await page.getByPlaceholder('Jouw wachtwoord').waitFor({ timeout: 20_000 })
  await page.getByPlaceholder('Jouw wachtwoord').fill(password)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  // Wait for redirect to dashboard
  await expect(page).toHaveURL('/', { timeout: 20_000 })
}

setup('authenticate as admin', async ({ page }) => {
  await login(page, process.env.TEST_ADMIN_EMAIL!, process.env.TEST_ADMIN_PASSWORD!)
  await page.context().storageState({ path: ADMIN_FILE })
})

setup('authenticate as player', async ({ page }) => {
  await login(page, process.env.TEST_PLAYER_EMAIL!, process.env.TEST_PLAYER_PASSWORD!)
  await page.context().storageState({ path: PLAYER_FILE })
})
